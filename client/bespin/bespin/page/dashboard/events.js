/*
	Copyright (c) 2004-2009, The Dojo Foundation All Rights Reserved.
	Available via Academic Free License >= 2.1 OR the modified BSD license.
	see: http://dojotoolkit.org/license for details
*/


if(!dojo._hasResource["bespin.page.dashboard.events"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["bespin.page.dashboard.events"] = true;
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
 * See the License for the specific language governing rights and
 * limitations under the License.
 *
 * The Original Code is Bespin.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Bespin Team (bespin@mozilla.com)
 *
 * ***** END LICENSE BLOCK ***** */

dojo.provide("bespin.page.dashboard.events");

if (!bespin.page.dashboard) bespin.page.dashboard = {};

// After a project is imported or created, do a list
bespin.subscribe("project:imported", function(event) {
    bespin.page.dashboard.refreshProjects(); // get projects
});

bespin.subscribe("project:set", function(event) {
    bespin.get('editSession').project = event.project; // set it in the session

    if (!event.fromDashboardItemSelected) {
        // selects the project in the tree and fire the itemselected event
        bespin.page.dashboard.tree.lists[0].selectItemByText(event.project);
        bespin.page.dashboard.tree.itemSelected({thComponent: bespin.page.dashboard.tree.lists[0], item: bespin.page.dashboard.tree.lists[0].selected});
    }
});

bespin.subscribe("project:create", function(event) {
    bespin.page.dashboard.refreshProjects(); // get projects
});

bespin.subscribe("project:delete", function(event) {
    bespin.page.dashboard.refreshProjects(); // get projects
});

// ** {{{ Event: session:status }}} **
//
// Observe a request for session status
bespin.subscribe("session:status", function(event) {
    var editSession = bespin.get('editSession');
    var msg = 'Hey ' + editSession.username;

    if (editSession.project) {
        msg += ', you appear to be highlighting the project ' + editSession.project;
    } else {
        msg += ", you haven't select a project yet.";
    }

    bespin.publish("message:output", { msg: msg });
});

// ** {{{ Event: editor:newfile }}} **
//
// Observe a request for a new file to be created
bespin.subscribe("editor:newfile", function(event) {
    var project = event.project || bespin.get('editSession').project;

    if (!project) {
        bespin.publish("message:error", { msg: 'The new file action requires a project' });
        return;
    }

    var newfilename = event.newfilename || "new.txt";

    var opts = { newFile: true };
    if (event.content) opts.content = event.content;

    bespin.util.navigate.editor(project, newfilename, opts);
});

// ** {{{ Event: editor:openfile }}} **
//
// Cause the editor to launch
bespin.subscribe("editor:openfile", function(event) {
    bespin.util.navigate.editor(event.project, event.filename, {});
});

}
