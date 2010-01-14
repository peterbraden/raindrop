/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Raindrop.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc..
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * */

/*jslint plusplus: false, nomen: false */
/*global run: false */
"use strict";

run.modify("rdw/Message", "rdw/ext/MessageFlickrLinkAttachments",
["run", "rd", "dojo", "rdw/Message"], function (
  run,   rd,   dojo,   Message) {

    rd.addStyle("rdw/ext/css/MessageFlickrLinkAttachments");

    /* Applies a display extension to rdw/Message.
    Allows showing links included in the message as inline attachments
    */
    rd.applyExtension("rdw/ext/MessageFlickrLinkAttachments", "rdw/Message", {
        addToPrototype: {
            linkHandlers: [
                function (link) {
                    //NOTE: the "this" in this function is the instance of rdw/Message.
    
                    //See if link matches the schema on message.
                    var schema = this.msg.schemas["rd.msg.body.flickr"],
                        html, imgUrl, handled = false, href;
                    if (!schema || schema.ref_link !== link) {
                        return false;
                    }
    
                    //If URL does not match the flickr url then kick it out.
                    handled = dojo.some(schema.urls.url, function (url) {
                        return link === url._content;
                    });
                    if (!handled) {
                        return false;
                    }
    
                    // http:\/\/farm3.static.flickr.com\/2684\/4252109194_ba795640e8_s.jpg
                    imgUrl = "http://farm" + schema.farm + ".static.flickr.com/" +
                                        schema.server + "/" + schema.id + "_" +
                                        schema.secret + "_s.jpg";
    
                    href = 'http://www.flickr.com/' + schema.owner.nsid + '/' + schema.id + '/';
    
                    html = '<div class="flickr photo link hbox">' +
                           '    <div class="thumbnail boxFlex0">' +
                           '        <a target="_blank" href="' + href + '"><img src="' +
                                        imgUrl +
                                    '" class="flickr"></a>' +
                           '    </div>' +
                           '    <div class="information boxFlex1">' +
                                    '<a target="_blank" class="title" ' + href + '">' +
                                        schema.title._content + '</a>' +
                                    '<abbr class="owner" title="' + schema.owner.username +
                                        '">' + schema.owner.realname + '</abbr>' +
                                        '<div class="description">' + schema.description._content + '</div>' +
                           '    </div>' +
                           '</div>';
    
                    this.addAttachment(html, 'link');
    
                    return true;
                }
            ]
        }
    });
});
