/*
	Copyright (c) 2004-2009, The Dojo Foundation All Rights Reserved.
	Available via Academic Free License >= 2.1 OR the modified BSD license.
	see: http://dojotoolkit.org/license for details
*/


if(!dojo._hasResource["bespin.page.dashboard.dependencies"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["bespin.page.dashboard.dependencies"] = true;
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
 
dojo.provide("bespin.page.dashboard.dependencies");

dojo.require("dojo.cookie"); 

dojo.require("bespin.bespin"); 
dojo.require("bespin.events");

dojo.require("bespin.util.canvas");
dojo.require("bespin.util.keys"); 
dojo.require("bespin.util.navigate");
dojo.require("bespin.util.path");
dojo.require("bespin.util.tokenobject");
dojo.require("bespin.util.urlbar");

dojo.require("bespin.client.filesystem");
dojo.require("bespin.client.settings");
dojo.require("bespin.client.server");
dojo.require("bespin.client.session");

dojo.require("bespin.cmd.commandline");
dojo.require("bespin.cmd.commands");
dojo.require("bespin.vcs");      // load up VCS module and its commands
dojo.require("bespin.jetpack");  // load up Jetpack module and its commands
dojo.require("bespin.cmd.dashboardcommands");

// dojo.require("bespin.social");

// -- The main dashboard subsystems
dojo.require("bespin.page.dashboard.components");
dojo.require("bespin.page.dashboard.events");
dojo.require("bespin.page.dashboard.init");

}
