# An 'identity spawner' which simply looks for identities we send things to.
# This works on normalized 'body' so is suitable for all message objects.
def handler(doc):
    ids = get_my_identities()
    if doc.get('from') in ids:
        # emit_related_identies accepts multiple identities all identifying the
        # same contact - but in the case of emails, each email addy is
        # (presumably) a different person.
        all_to = doc.get('to', []) + doc.get('cc', [])
        all_display = doc.get('to_display') + doc.get('cc_display', [])
        for idid, name in zip(all_to, all_display):
            # emit a sequence of (identity_id, relationship) tuples - where
            # all we know about this relationship is it is an email addy...
            emit_related_identities([(idid, 'email')], {'name': name})
