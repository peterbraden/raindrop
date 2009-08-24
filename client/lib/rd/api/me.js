//Never dojo.require this file directly, only dojo.require rd.api.
dojo.provide("rd.api.me");

dojo.require("rd.api");
dojo.require("rd.api.identity");

rd.api.me = {
  /**
   * @private
   * loads the account info just one time.
   *
   * @param dfd {dojo.Deferred} a deferred to call when loading is complete.
   */
  _load: function(dfd) {
    //If the request has not been triggered, do it now.
    if (!this._dfd) {
      this._dfd = new dojo.Deferred();
      rd.api().megaview({
        key: ["rd.core.content", "schema_id", "rd.account"],
        reduce: false,
        include_docs: true
      })
      .ok(function(json) {
        //Transform the response to be identity IDs
        //so it can be consumed by identity()
        if(!json.rows.length) {
          return new Error("no accounts");
        } else {
          var ids = [];
          for (var i = 0, row; row = json.rows[i]; i++) {
            ids.push([row.doc.kind, row.doc.username]);
          }
          return ids;
        }
      })
      .error(this._dfd)
      .identity()
      .ok(this, function(identities) {
        this._dfd.callback(identities);
      })
      .error(this._dfd);
    }

    //Now register the dfd with the private callback.
    this._dfd.addCallback(dfd, "callback");
    this._dfd.addErrback(dfd, "errback");
  }
}

rd.api.extend({
  /**
   * Retrieves identities associated with current user account.
   */
  me: function() {
    rd.api.me._load(this._deferred);
    return this;
  }
});
