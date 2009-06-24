from twisted.internet import protocol, ssl, defer, error
from twisted.mail import imap4
import logging
from email.utils import mktime_tz, parsedate_tz
import time

from ..proc import base

brat = base.Rat

logger = logging.getLogger(__name__)

def get_rdkey_for_email(msg_id):
  return ("email", msg_id)

class ImapClient(imap4.IMAP4Client):
  def _defaultHandler(self, tag, rest):
    # XXX - worm around a bug related to MismatchedQuoting exceptions.
    # Probably: http://twistedmatrix.com/trac/ticket/1443
    # "[imap4] mismatched quoting spuriously raised" - raised early 2006 :(
    try:
      imap4.IMAP4Client._defaultHandler(self, tag, rest)
    except imap4.MismatchedQuoting, exc:
      logger.warn('ignoring mismatched quoting error: %s', exc)
      # The rest seems necessary to 'gracefully' ignore the error.
      cmd = self.tags[tag]
      cmd.defer.errback(exc)
      del self.tags[tag]
      self.waiting = None
      self._flushQueue()

  def serverGreeting(self, caps):
    logger.debug("IMAP server greeting: capabilities are %s", caps)
    return self._doAuthenticate()

  def _doAuthenticate(self):
    def return_self(_):
      return self.deferred.callback(self)
    if self.account.details.get('crypto') == 'TLS':
      d = self.startTLS(self.factory.ctx)
      d.addErrback(self.accountStatus,
                   brat.SERVER, brat.BAD, brat.CRYPTO, brat.PERMANENT)
      d.addCallback(self._doLogin)
    else:
      d = self._doLogin()
    d.addErrback(self.accountStatus,
                 brat.SERVER, brat.BAD, brat.PASSWORD, brat.PERMANENT)
    d.addCallback(return_self)
    return d

  def _doLogin(self, *args, **kwargs):
    return self.login(self.account.details['username'],
                      self.account.details['password'])

  # XXX - this is misplaced...
  def accountStatus(self, result, *args):
    return self.account.reportStatus(*args)

class ImapProvider(object):
  # The 'id' of this extension
  # XXX - should be managed by our caller once these 'protocols' become
  # regular extensions.
  rd_extension_id = 'proto.imap'

  def __init__(self, account, options, reactor):
    self.account = account
    self.options = options
    self.doc_model = account.doc_model
    self.reactor = reactor
    self.fetch_queue = defer.DeferredQueue()
    self.write_queue = defer.DeferredQueue()

  @defer.inlineCallbacks
  def _reqList(self, conn, *args, **kwargs):
    self.account.reportStatus(brat.EVERYTHING, brat.GOOD)
    result = yield conn.list('', '*')
    # quickly scan through the folders list building the ones we will
    # process and the order.
    logger.info("examining folders")
    done_recent = {}
    # First zoom over the list looking for top-level folders.
    todo_first = []
    todo_second = []
    all_folders = []
    for flags, delim, name in result:
      logger.debug('checking folder %s (flags=%s)', name, flags)
      if r"\Noselect" in flags:
        logger.debug("'%s' is unselectable - skipping", name)
        continue

      # XXX - sob - markh sees:
      # 'Folder [Gmail]/All Mail has 38163 messages, 36391 of which we haven'
      # although we obviously have seen them already in the other folders.
      # XXX - but should not be necessary now we are using message-id?
      if name and name.startswith('['):
        logger.info("'%s' appears special - skipping", name)
        continue

      all_folders.append(name)
      if delim in name:
        todo_second.append(name)
      elif name.lower()=='inbox':
        todo_first.insert(0, name)
      else:
        todo_first.append(name)

    try:
      _ = yield self._updateFolders(conn, todo_first + todo_second)
    except:
      logger.exception("Failed to update folder")
    logger.info('imap queue generation finished - waiting for queues to finish')

  @defer.inlineCallbacks
  def _checkQuickRecent(self, conn, folder_path, max_to_fetch):
    nitems = yield conn.search("((OR UNSEEN (OR RECENT FLAGGED))"
                               " UNDELETED SMALLER 50000)", uid=True)
    if not nitems:
      logger.debug('folder %r has no quick items', folder_path)
      return
    nitems = nitems[-max_to_fetch:]
    batch = imap4.MessageSet(nitems[0], nitems[-1])
    results = yield conn.fetchAll(batch, uid=True)
    logger.info('folder %r has %d quick items', folder_path, len(results))
    # Make a simple list.
    infos = [results[seq] for seq in sorted(int(k) for k in results)]
    if infos:
      self.fetch_queue.put((folder_path, infos))

  @defer.inlineCallbacks
  def _updateFolders(self, conn, all_names):
    # Fetch all state cache docs for all mailboxes in one go.
    # XXX - need key+schema here, but we don't use multiple yet.
    acct_id = self.account.details.get('id')
    startkey = ['rd.core.content', 'key', ['imap-mailbox', [acct_id]]]
    endkey = ['rd.core.content', 'key', ['imap-mailbox', [acct_id, {}]]]
    results = yield self.doc_model.open_view(startkey=startkey,
                                             endkey=endkey, reduce=False,
                                             include_docs=True)
    # build a map of the docs keyed by folder-name.
    caches = {}
    for row in results['rows']:
      doc = row['doc']
      assert doc['rd_schema_id'] == 'rd.imap.mailbox-cache' ## fix me above
      folder_name = doc['rd_key'][1][1]
      caches[folder_name] = doc
    logger.debug('opened cache documents for %d folders', len(caches))

    # All folders without cache docs get the special 'fetch quick'
    # treatment...
    for name in all_names:
      if name not in caches:
        _ = yield conn.select(name)
        _ = yield self._checkQuickRecent(conn, name, 20)

    # Now update the cache for all folders...
    sync_by_name = {}
    for name in all_names:
      info = yield conn.select(name)
      logger.debug("info for %r is %r", name, info)

      cache_doc = caches.get(name, {})
      update_doc = yield self._syncFolderInfo(conn, name, info, cache_doc)
      if update_doc is not None:
        items = {'uidvalidity': update_doc['uidvalidity'],
                 'infos': update_doc['infos']
                 }
        new_item = {'rd_key' : ['imap-mailbox', [acct_id, name]],
                    'schema_id': 'rd.imap.mailbox-cache',
                    'ext_id': self.rd_extension_id,
                    'items': items,
        }
        if '_id' in update_doc:
          new_item['_id'] = update_doc['_id']
          new_item['_rev'] = update_doc['_rev']
        _ = yield self.doc_model.create_schema_items([new_item])
        sync_items = update_doc['infos']
      else:
        sync_items = cache_doc.get('infos')
      sync_by_name[name] = sync_items[:]
    # XXX - todo - should nuke old folders which no longer exist.

    # Take a copy of the infos before consuming them priming the queues...
    todo_locations = sync_by_name.copy()

    # now the final step - use the cached info to sync each and every mailbox
    while sync_by_name:
      # do 'n' in each folder, then n more in each folder, etc.
      for name in all_names:
        try:
          todo = sync_by_name[name]
        except KeyError:
          continue
        else:
          # do later ones first...
          batch = todo[-50:]
          rest = todo[:-50]
          logger.log(1, 'queueing check of %d items in %r', len(batch), name)
          self.fetch_queue.put((name, batch))
          if rest:
            sync_by_name[name] = rest
          else:
            del sync_by_name[name]

    # and while the items are being fetched we can update the location info
    # for each folder.
    logger.info('starting message location updates...')
    for name, items in todo_locations.iteritems():
      _ = yield self._updateLocations(name, items)

  @defer.inlineCallbacks
  def _syncFolderInfo(self, conn, folder_path, server_info, cache_doc):
    suidv = int(server_info['UIDVALIDITY'])
    if suidv != cache_doc.get('uidvalidity'):
      infos = []
      cache_doc['uidvalidity'] = suidv
      force_return = True
    else:
      force_return = False
      infos = cache_doc.get('infos', [])
    cache_doc['infos'] = infos

    if infos:
      cached_uid_next = int(infos[-1]['UID']) + 1
    else:
      cached_uid_next = 1

    suidn = int(server_info['UIDNEXT'])
    if suidn <= cached_uid_next:
      logger.info('folder %r is up-to-date', folder_path)
      if force_return:
        defer.returnValue(cache_doc)
      defer.returnValue(None)

    # Get new messages.
    logger.debug('requesting info for items in %r', folder_path)
    try:
      results = yield conn.fetchAll("%d:*" % (cached_uid_next,), True)
    except imap4.MismatchedQuoting, exc:
      logger.exception("failed to fetchAll folder %r", folder_path)
      results = []
    logger.info("folder %r has %d new items", folder_path, len(results))
    if not results:
      defer.returnValue(None)

    # Turn the dict back into the list it started as...
    for seq in sorted(int(k) for k in results):
      info = results[seq]
      # See above - asking for '900:*' in gmail may return a single item
      # with UID of 899 - and that is already in our list.  So only append
      # new items when they are > then what we know about.
      this_uid = int(info['UID'])
      if this_uid < cached_uid_next:
        continue
      cached_uid_next = this_uid + 1
      infos.append(info)
    defer.returnValue(cache_doc)

  @defer.inlineCallbacks
  def _updateLocations(self, folder_path, results):
    logger.debug("checking what we know about items in folder %r", folder_path)
    acct_id = self.account.details.get('id')
    # Build a map keyed by the UID of the message.
    by_uid = {}
    for result in results:
      by_uid[int(result['UID'])] = result

    # fetch all things in couch which are currently associated
    startloc = ['imap', [acct_id, folder_path]]
    endloc = ['imap', [acct_id, folder_path, {}]]
    startkey = ['rd.msg.location', 'location', startloc]
    endkey = ['rd.msg.location', 'location', endloc]
    existing = yield self.doc_model.open_view(startkey=startkey,
                                              endkey=endkey, reduce=False)
    seen = set() # if dupes in a folder we only want to write it once.
    for row in existing['rows']:
      loc = row['key'][2]
      assert loc[0]=='imap'
      assert loc[1][0]==acct_id and loc[1][1]==folder_path
      uid = loc[1][2]
      info = by_uid.setdefault(uid, {})
      info['COUCH'] = row

    # Finally merge the differences between what imap has and couch has
    to_up = []
    for uid, info in by_uid.iteritems():
      if 'COUCH' in info and 'ENVELOPE' in info:
        # already exists in both places - cool!
        rdkey = get_rdkey_for_email(info['ENVELOPE'][-1])
        seen.add(rdkey)
      elif 'COUCH' in info:
        couch_row = info['COUCH']
        # no longer in that folder...
        to_up.append({'_id': couch_row['id'],
                      '_rev': couch_row['value']['_rev'],
                      'deleted': True,
                    })
      else:
        # Item in the folder but couch doesn't know it is there.
        # We hack the 'extension_id' in a special way to allow multiple of the
        # same schema
        rdkey = get_rdkey_for_email(info['ENVELOPE'][-1])
        if rdkey in seen:
          logger.debug("skipping duplicate message in folder")
          continue
        seen.add(rdkey)
        loc = ['imap', [acct_id, folder_path, uid]]
        to_up.append({'rd_key': rdkey,
                      'ext_id': "%s~%s~%s" % (self.rd_extension_id, acct_id, folder_path),
                      'schema_id': 'rd.msg.location',
                      'items': {'location': loc},
                    })
    if to_up:
      logger.info("folder %r info needs to update %d location records", folder_path,
                  len(to_up))
      _ = yield self.doc_model.create_schema_items(to_up)

  def results_by_rdkey(self, infos):
    # Transform a list of IMAP infos into a map with the results keyed by the
    # 'rd_key' (ie, message-id), but skipping messages which don't meet
    # our 'filter' criteria
    msg_infos = {}
    for msg_info in infos:
      if self.options.max_age:
        # XXX - we probably want the 'internal date'...
        date_str = msg_info['ENVELOPE'][0]
        try:
          date = mktime_tz(parsedate_tz(date_str))
        except (ValueError, TypeError):
          continue # invalid date - skip it.
        if date < time.time() - self.options.max_age:
          logger.log(1, 'skipping message - too old')
          continue

      msg_id = msg_info['ENVELOPE'][-1]
      if msg_id in msg_infos:
        # This isn't a very useful check - we are only looking in a single
        # folder...
        logger.warn("Duplicate message ID %r detected", msg_id)
        # and it will get clobbered below :(
      msg_infos[get_rdkey_for_email(msg_id)] = msg_info
    return msg_infos

  @defer.inlineCallbacks
  def _findMissingItems(self, results, folder_path):
    # 'invert' the map so we have one keyed by our raindrop key
    msg_infos = self.results_by_rdkey(results)
    if not msg_infos:
      # nothing new in this batch
      defer.returnValue(None)

    # Get all messages that already have this schema
    keys = [['rd.core.content', 'key-schema_id', [k, 'rd.msg.rfc822']]
            for k in msg_infos.keys()]
    result = yield self.doc_model.open_view(keys=keys, reduce=False)
    seen = set([tuple(r['value']['rd_key']) for r in result['rows']])
    # convert each key elt to a list like we get from the views.
    remaining = set(msg_infos.iterkeys())-set(seen)

    logger.debug("batch for folder %s has %d messages, %d new", folder_path,
                len(msg_infos), len(remaining))
    rem_uids = [int(msg_infos[k]['UID']) for k in remaining]
    # *sob* - re-invert keyed by the UID.
    by_uid = {}
    for key, info in msg_infos.iteritems():
      uid = int(info['UID'])
      if uid in rem_uids:
        info['RAINDROP_KEY'] = key
        by_uid[uid] = info
    defer.returnValue(by_uid)

  @defer.inlineCallbacks
  def _processFolderBatch(self, conn, folder_path, infos):
    """Called asynchronously by a queue consumer"""
    conn.select(folder_path) # should check if it already is selected?
    acct_id = self.account.details.get('id')
    by_uid = yield self._findMissingItems(infos, folder_path)
    if not by_uid:
      # nothing new in this batch
      defer.returnValue(0)

    num = 0
    # fetch most-recent (highest UID) first...
    left = sorted(by_uid.keys(), reverse=True)
    while left:
      # do 10 at a time...
      this = left[:10]
      left = left[10:]
      to_fetch = ",".join(str(v) for v in this)
      results = yield conn.fetchMessage(to_fetch, uid=True)
      # Run over the results stashing in our by_uid dict.
      infos = []
      for info in results.values():
        uid = int(info['UID'])
        content = info['RFC822']
        flags = by_uid[uid]['FLAGS']
        rdkey = by_uid[uid]['RAINDROP_KEY']
        mid = rdkey[-1]
        # XXX - we need something to make this truly unique.
        logger.debug("new imap message %r (flags=%s)", mid, flags)
  
        # put our schemas together
        attachments = {'rfc822' : {'content_type': 'message',
                                   'data': content,
                                   }
        }
        items = {'_attachments': attachments}
        infos.append({'rd_key' : rdkey,
                      'ext_id': self.rd_extension_id,
                      'schema_id': 'rd.msg.rfc822',
                      'items': items})
      num += len(infos)
      self.write_queue.put(infos)
      #_ = yield self.doc_model.create_schema_items(infos)
    defer.returnValue(num)

  @defer.inlineCallbacks
  def _consumeFetchRequests(self, conn):
    q = self.fetch_queue
    while True:
      result = yield q.get()
      if result is None:
        logger.info('fetch queue processor stopping')
        q.put(None) # for anyone else processing the queue...
        break
      # else a real item to process.
      folder, items = result
      logger.debug('checking %d items from %r', len(items), folder)
      try:
        num = yield self._processFolderBatch(conn, folder, items)
        logger.debug('created %d items for %r', num, folder)
      except:
        if not self.reactor.running:
          break
        logger.exception('failed to process a message batch in folder %r',
                         folder)

  @defer.inlineCallbacks
  def _consumeWriteRequests(self):
    q = self.write_queue
    while True:
      items = yield q.get()
      if items is None:
        logger.info('write queue processor stopping')
        break
      # else a real set of schemas to write and process.
      logger.debug('writing %d schema items', len(items))
      try:
        _ = yield self.doc_model.create_schema_items(items)
      except:
        if not self.reactor.running:
          break
        logger.exception('failed to write items')

class ImapClientFactory(protocol.ClientFactory):
  protocol = ImapClient

  def __init__(self, account, conductor):
    # base-class has no __init__
    self.account = account
    self.conductor = conductor
    self.doc_model = account.doc_model # this is a little confused...

    self.ctx = ssl.ClientContextFactory()
    self.backoff = 8 # magic number

  def buildProtocol(self, addr):
    p = self.protocol(self.ctx)
    p.factory = self
    p.account = self.account
    p.doc_model = self.account.doc_model
    p.deferred = self.deferred # this isn't going to work in reconnect scenarios
    return p

  def connect(self):
    details = self.account.details
    logger.debug('attempting to connect to %s:%d (ssl: %s)',
                 details['host'], details['port'], details['ssl'])
    reactor = self.conductor.reactor
    self.deferred = defer.Deferred()
    if details.get('ssl'):
      reactor.connectSSL(details['host'], details['port'], self, self.ctx)
    else:
      reactor.connectTCP(details['host'], details['port'], self)
    return self.deferred

  def clientConnectionLost(self, connector, reason):
    # the flaw in this is that we start from scratch every time; which is why
    #  most of the logic in the client class should really be pulled out into
    #  the account logic, probably.  this class itself may have issues too...
    # XXX - also note that a simple exception in other callbacks can trigger
    # this - meaning we retry just to hit the same exception.
    # XXX - and - everything we do to close the connection seems to complain :(
    logger.info('imap connection was closed: %s', reason)
    return

    # XXXX - not reached!!
    if reason.check(error.ConnectionDone):
        # only an error if premature
        if not self.deferred.called:
            self.deferred.errback(reason)
    else:
        #self.deferred.errback(reason)
        logger.debug('lost connection to server, going to reconnect in a bit')
        self.conductor.reactor.callLater(2, self.connect)

  def clientConnectionFailed(self, connector, reason):
    self.account.reportStatus(brat.SERVER, brat.BAD, brat.UNREACHABLE,
                              brat.TEMPORARY)
    logger.warning('Failed to connect, will retry after %d secs',
                   self.backoff)
    # It occurs that some "account manager" should be reported of the error,
    # and *it* asks us to retry later?  eg, how do I ask 'ignore backoff -
    # try again *now*"?
    self.conductor.reactor.callLater(self.backoff, self.connect)
    self.backoff = min(self.backoff * 2, 600) # magic number


class IMAPAccount(base.AccountBase):
  @defer.inlineCallbacks
  def startSync(self, conductor):
    prov = ImapProvider(self, conductor.options, conductor.reactor)

    @defer.inlineCallbacks
    def start_fetchers(n):
      ds = []
      for i in range(n):
        factory = ImapClientFactory(self, conductor)
        fetch_connection = yield factory.connect()
        ds.append(prov._consumeFetchRequests(fetch_connection))
      _ = yield defer.DeferredList(ds)
      # fetchers done - post a stop request to the writer...
      prov.write_queue.put(None)
      # *sob* - doing a 'logout' (a) may take many seconds, and (b) still
      # reports a 'problem' to connectionLost - so just abandon it :(
      #_ = yield fetch_connection.logout()

    @defer.inlineCallbacks
    def start_producer():
      factory = ImapClientFactory(self, conductor)
      client = yield factory.connect()
      _ = yield prov._reqList(client)
      # We've now finished producing 'fetch' requests for the queue - but with
      # a perfectly good connection sitting here doing nothing - so first,
      # post a message to the queue telling it we are done, then immediately
      # start processing the queue to help it finish.
      logger.debug('producer done - posting stop request to consumer')
      prov.fetch_queue.put(None)
      _ = yield prov._consumeFetchRequests(client)
      logger.debug('producer finished consuming!')
      # See above - abandon the connection...
      #_ = yield client.logout()

    @defer.inlineCallbacks
    def start_writer():
      _ = yield prov._consumeWriteRequests()

    # fire off the producer and queue consumers.  We have 2 'fetchers', which
    # are io-bound talking to the IMAP server, and a single 'writer', which
    # is responsible for writing couch docs, and as a side-effect, doing the
    # 'processing' of these items (we can't have multiple things writing at
    # the moment as the 'conversation' extension in particular will generate
    # conflicts if run concurrently...)
    _ = yield defer.DeferredList([start_producer(),
                                  start_fetchers(2),
                                  start_writer()])
