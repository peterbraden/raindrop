/*
	Copyright (c) 2004-2009, The Dojo Foundation All Rights Reserved.
	Available via Academic Free License >= 2.1 OR the modified BSD license.
	see: http://dojotoolkit.org/license for details
*/


if(!dojo._hasResource["dijit._editor.html"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dijit._editor.html"] = true;
dojo.provide("dijit._editor.html");

dijit._editor.escapeXml=function(/*String*/str, /*Boolean?*/noSingleQuotes){
	//summary:
	//		Adds escape sequences for special characters in XML: &<>"'
	//		Optionally skips escapes for single quotes
	str = str.replace(/&/gm, "&amp;").replace(/</gm, "&lt;").replace(/>/gm, "&gt;").replace(/"/gm, "&quot;");
	if(!noSingleQuotes){
		str = str.replace(/'/gm, "&#39;");
	}
	return str; // string
};

dijit._editor.getNodeHtml=function(/* DomNode */node){
	var output;
	switch(node.nodeType){
		case 1: //element node
			output = '<' + node.nodeName.toLowerCase();

			//store the list of attributes and sort it to have the
			//attributes appear in the dictionary order
			var attrarray = [];
			if(dojo.isIE && node.outerHTML){
				var s = node.outerHTML;
				s = s.substr(0, s.indexOf('>'))
					.replace(/(['"])[^"']*\1/g, ''); //to make the following regexp safe
				var reg = /(\b\w+)\s?=/g;
				var m, key;
				while((m = reg.exec(s))){
					key = m[1];
					if(key.substr(0,3) != '_dj'){
						if(key == 'src' || key == 'href'){
							if(node.getAttribute('_djrealurl')){
								attrarray.push([key,node.getAttribute('_djrealurl')]);
								continue;
							}
						}
						var val;
						switch(key){
							case 'style':
								val = node.style.cssText.toLowerCase();
								break;
							case 'class':
								val = node.className;
								break;
							default:
								val = node.getAttribute(key);
						}
						if(val != null){
							attrarray.push([key, val.toString()]);
						}
					}
				}
			}else{
				var attr, i = 0;
				while((attr = node.attributes[i++])){
					//ignore all attributes starting with _dj which are
					//internal temporary attributes used by the editor
					var n = attr.name;
					if(n.substr(0,3) != '_dj' /*&&
						(attr.specified == undefined || attr.specified)*/){
						var v = attr.value;
						if(n == 'src' || n == 'href'){
							if(node.getAttribute('_djrealurl')){
								v = node.getAttribute('_djrealurl');
							}
						}
						attrarray.push([n,v]);
					}
				}
			}
			attrarray.sort(function(a,b){
				return a[0]<b[0]?-1:(a[0]==b[0]?0:1);
			});
			var j = 0;
			while((attr = attrarray[j++])){
				output += ' ' + attr[0] + '="' +
					(dojo.isString(attr[1]) ? dijit._editor.escapeXml(attr[1], true) : attr[1]) + '"';
			}
			if(node.childNodes.length){
				output += '>' + dijit._editor.getChildrenHtml(node)+'</'+node.nodeName.toLowerCase()+'>';
			}else{
				output += ' />';
			}
			break;
		case 3: //text
			// FIXME:
			output = dijit._editor.escapeXml(node.nodeValue, true);
			break;
		case 8: //comment
			// FIXME:
			output = '<!--' + dijit._editor.escapeXml(node.nodeValue, true) + '-->';
			break;
		default:
			output = "<!-- Element not recognized - Type: " + node.nodeType + " Name: " + node.nodeName + "-->";
	}
	return output;
};

dijit._editor.getChildrenHtml = function(/* DomNode */dom){
	// summary: Returns the html content of a DomNode and children
	var out = "";
	if(!dom){ return out; }
	var nodes = dom["childNodes"] || dom;

	//IE issue.
	//If we have an actual node we can check parent relationships on for IE, 
	//We should check, as IE sometimes builds invalid DOMS.  If no parent, we can't check
	//And should just process it and hope for the best.
	var checkParent = !dojo.isIE || nodes !== dom;

	var node, i = 0;
	while((node = nodes[i++])){
		//IE is broken.  DOMs are supposed to be a tree.  But in the case of malformed HTML, IE generates a graph
		//meaning one node ends up with multiple references (multiple parents).  This is totally wrong and invalid, but
		//such is what it is.  We have to keep track and check for this because otherise the source output HTML will have dups.
		//No other browser generates a graph.  Leave it to IE to break a fundamental DOM rule.  So, we check the parent if we can
		//If we can't, nothing more we can do other than walk it.
		if(!checkParent || node.parentNode == dom){
			out += dijit._editor.getNodeHtml(node);
		}
	}
	return out; // String
};

}
