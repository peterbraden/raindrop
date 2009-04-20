//xdomain loading wrapper. Can be inserted by a build process, but manually doing it for now.
window[(typeof (djConfig)!="undefined"&&djConfig.scopeMap&&djConfig.scopeMap[0][1])||"dojo"]._xdResourceLoaded(function(dojo, dijit, dojox){
  return {
  depends:[["provide","rd"], ["require","couch"]],defineResource:function(dojo, dijit, dojox){

//Main module definition
dojo.provide("rd");

dojo.require("couch");

/*
This file provides some basic environment services running in raindrop.
*/

//Override a function in dojo so that we can cancel publish calls by returning false
//from a listener.
dojo._listener.getDispatcher = function(){
  // following comments pulled out-of-line to prevent cloning them 
  // in the returned function.
  // - indices (i) that are really in the array of listeners (ls) will 
  //   not be in Array.prototype. This is the 'sparse array' trick
  //   that keeps us safe from libs that take liberties with built-in 
  //   objects
  // - listener is invoked with current scope (this)
  return function(){
    var ap=Array.prototype, c=arguments.callee, ls=c._listeners, t=c.target;
    // return value comes from original target function
    var r = t && t.apply(this, arguments);
    // make local copy of listener array so it is immutable during processing
    var lls;
    //>>includeStart("connectRhino", kwArgs.profileProperties.hostenvType == "rhino");
    if(!dojo.isRhino){
    //>>includeEnd("connectRhino");
      //>>includeStart("connectBrowser", kwArgs.profileProperties.hostenvType != "rhino");
      lls = [].concat(ls);
      //>>includeEnd("connectBrowser");
    //>>includeStart("connectRhino", kwArgs.profileProperties.hostenvType == "rhino");
    }else{
      // FIXME: in Rhino, using concat on a sparse Array results in a dense Array.
      // IOW, if an array A has elements [0, 2, 4], then under Rhino, "concat [].A"
      // results in [0, 1, 2, 3, 4], where element 1 and 3 have value 'undefined'
      // "A.slice(0)" has the same behavior.
      lls = [];
      for(var i in ls){
        lls[i] = ls[i];
      }
    }
    //>>includeEnd("connectRhino");

    // invoke listeners after target function
    for(var i in lls){
      if(!(i in ap)){
        //RAINDROP: the if === false test added for raindrop.
        if (lls[i].apply(this, arguments) === false){
          break;
        }
      }
    }
    // return value comes from original target function
    return r;
  }
};

dojo.mixin(rd, {
  ready: dojo.addOnLoad,

  html: function(/*String*/html, /*DOMNode?*/refNode, /*String?*/position) {
    //summary: converts html string to a DOM node or DocumentFragment. Optionally
    //places that node/fragment relative refNode. "position" values are same as
    //dojo.place: "first" and "last" indicate positions as children of refNode,
    //"replace" replaces refNode, "only" replaces all children.  "before" and "last"
    //indicate sibling positions to refNode. position defaults to "last" if not specified.
    html = dojo._toDom(html);
    if (refNode) {
      return dojo.place(html, refNode, position);
    } else {
      return html;
    }
  },

  escapeHtml: function(/*String*/html, /*DOMNode?*/refNode, /*String?*/position) {
    //summary: escapes HTML string so it is safe to embed in the DOM. Optionally
    //places that HTML relative refNode. "position" values are same as
    //dojo.place: "first" and "last" indicate positions as children of refNode,
    //"replace" replaces refNode, "only" replaces all children.  "before" and "last"
    //indicate sibling positions to refNode. position defaults to "last" if not specified.
    html = html && html.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (refNode) {
      return rd.html(html, refNode, position);
    } else {
      return html;
    }
  },

  //Shortcut methods for dojo.publish and subscribe. rd.pub more aesthetically pleasing
  //than dojo.publish because it does not force the parameters to be in an array,
  //but rather as variable number of arguments to rd.pub.
  //Base on plugd versions of the code: http://code.google.com/p/plugd/source/browse/trunk/base.js
  sub: dojo.subscribe,
  unsub: dojo.unsubscribe,
  pub: function(){
    var a = dojo._toArray(arguments);
    return dojo.publish(a.shift(), a);
  },
  
  convertLines: function(text) {
    //Converts line returns to BR tags
    return text && text.replace(/\n/g, "<br>");  
  },

  loadStyle: function(/*String*/modulePath) {
    //summary: loads a CSS file based on a modulePath. This allows for reskinning
    //by overriding the modulePath via djConfig.modulePaths/dojo.registerModulePath()
    var url = dojo.moduleUrl(modulePath).toString();
    //Adjust URL a bit so we get dojo.require-like behavior
    url = url.substring(0, url.length - 1) + ".css";
    var link = dojo.create("link", {
      type: "text/css",
      rel: "stylesheet",
      href: url
    });
    dojo.doc.getElementsByTagName("head")[0].appendChild(link);
  },

  onExtPublish: function() {
    //summary: handles rd.pub calls to extensions for the first time.
    //This function will unregister itself after loading the extension
    //so that this code is only involved with initial loading of an extension.
    var topic = arguments[0];
    
    //Convert arguments to an array and pull off
    //the topic name since real endpoint subscribers in the
    //extensions will not be expecting it.
    var args = dojo._toArray(arguments);
    args.shift();

    //Unsubscribe so this function is not called again
    //for this topic
    dojo.unsub(extSubHandles[topic]);

    //Run the code to load the extension in a timeout so we can
    //return false from this listener to stop propagating the topic
    //publishing to other listeners. This will help ensure that the loaded
    //code does not get a topic publish twice.
    setTimeout(function(){
      //Load the code
      var modules = extSubs[topic];
      dojo.forEach(modules, dojo.require, dojo);
      dojo.addOnLoad(function() {
        //setTimeout(function(){
          dojo.publish(topic, args);
        //}, 20);
      });
    }, 20);

    //Stop the topic from continuing to notify other listeners
    return false;
  },

  onDocClick: function(evt) {
    //summary: Handles doc clicks to see if we need to use a register protocol.
    var node = evt.target;
    var href = node.href;
    
    if (!href && node.nodeName.toLowerCase() == "img") {
      //Small cheat to handle images that are hyperlinked.
      //May need to revisit this for the long term.
      href = node.parentNode.href;
    }

    if (href) {
      href = href.split("#")[1];
      if (href && href.indexOf("rd:") == 0) {
        //Have a valid rd: protocol link.
        href = href.split(":");
        var protocol = href[1];

        //Strip off rd: and protocol: for the final
        //value to pass to protocol handler.
        href.splice(0, 2);
        var value = href.join(":");
        
        dojo.stopEvent(evt);

        this.routeProtocol(protocol, value);
      }
    }
  },
  
  routeProtocol: function(/*String*/protocol, /*String*/value) {
    //summary: Handles loading of the protocols and routing the call to the right handler.
    //Fetch the protocols
    if (!this.protocols) {
      this.protocols = {};
      couch.db("extensions").view("all/protocol", {
        include_docs: true,
        group : false,
        success: dojo.hitch(this, function(json) {
          dojo.forEach(json.rows, function(row) {
            var val = row.value;
            this.protocols[val.protocol] = {
              handler: val.handler
            };
          }, this);
          this.callProtocol(protocol, value);
        })
      });
    } else {
      this.callProtocol(protocol, value);
    }
  },

  callProtocol: function(/*String*/protocol, /*String*/value) {
    //summary: Choose the right protocol extension to process the value.
    protocol = this.protocols[protocol];
    if (protocol) {
      //Get the module to load. Assumption is anything but the last .part
      //is the module name. The last .part is the method to call on the module.
      var module = protocol.handler.split(".");
      module.pop();

      //Dynamically load protocol handler on demand. If already loaded,
      //the code in the dojo.addOnLoad will execute immediately.
      dojo["require"](module.join("."));
      dojo.addOnLoad(function() {
        var handler = dojo.getObject(protocol.handler);
        if (handler) {
          handler(value);
        }
      });
    }
  }
});

//Register for the extenstion subscriptions as appropriate
//These were set in djConfig.rd.subs, but we use dojo.config
//here in case there is another dojo in the page that overwrites our djConfig.
var subs = dojo.config.rd.subs;
var extSubs = {};
var extSubHandles = {};
var tObj = {};
for (var i = 0; subs && i < subs.length; i++) {
  for (var topic in subs[i]) {
    //Use tObj to weed out stuff added by other JS code to Object.prototype
    if (!tObj[topic]) {
      if (!extSubs[topic]) {
        extSubs[topic] = [];
        extSubHandles[topic] = rd.sub(topic, dojo.hitch(rd, "onExtPublish", topic));
      }
      extSubs[topic].push(subs[i][topic]);
    }
  }
}

dojo.addOnLoad(function(){
  //Register an onclick handler on the body to handle "#rd:" protocol URLs.
  dojo.connect(document.documentElement, "onclick", rd, "onDocClick");
});


}}});
