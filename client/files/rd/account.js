dojo.provide("rd.account");

dojo.require("couch");
dojo.require("rd._api");

//Derives from rd._api
rd.account = dojo.delegate(rd._api);

dojo.mixin(rd.account, {
  //Storage by contactId
  _store: {},

  all: function(/*Function*/callback, /*Function?*/errback) {
    //summary: returns the accounts as an object. The object properties
    //are the account types, and for each account type property has an object
    //with the ID used for the account ("id" property) as well as the couch
    //document ID ("docId" property).
    callback(this._store);
  },

  _load: function() {
    //summary: rd._api trigger for loading api data.
    couch.db("raindrop").view("raindrop!accounts!all/_view/alltypes", {
      success: dojo.hitch(this, function(json) {
        //Error out if no rows return.
        if(!json.rows.length) {
          this.error = new Error("no accounts");
          this._onload();
        } else {
          for (var i = 0, row; row = json.rows[i]; i++) {
            this._store[row.value] = {
              id: row.key,
              docId: row.id
            }
          }
          this._onload();
        }
      }),
      error: dojo.hitch(this, function(err) {
        this.error = err;
        this._onload();
      })      
    });
  }
});

rd.account._protectPublic();