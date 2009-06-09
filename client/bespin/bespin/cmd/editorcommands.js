/*
	Copyright (c) 2004-2009, The Dojo Foundation All Rights Reserved.
	Available via Academic Free License >= 2.1 OR the modified BSD license.
	see: http://dojotoolkit.org/license for details
*/


if(!dojo._hasResource["bespin.cmd.editorcommands"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["bespin.cmd.editorcommands"] = true;
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
 
dojo.provide("bespin.cmd.editorcommands");

dojo.require("bespin.vcs");
dojo.require("bespin.jetpack");

// = Editor Commands =
//
// This array stores all of the editor commands. 

(function() {
    var keys = []; 
    for (var i in bespin.cmd.commands.store){
        keys.push(i);
    }  
    bespin.cmd.editorcommands.Commands = keys;  
})();

}
