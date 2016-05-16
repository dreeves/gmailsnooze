// Gmail Snooze (includes Re-Ping, previously included Auto-Expire)
// http://messymatters.com/snooze
// ------------------------------------------------------------ (80 chars) ---->

var BATCH = 500; // how many threads to fetch at a time
var SNZL = "snz"; // label that snoozed threads get ("" for none)

// Create a new trigger that calls a function daily at a given time (HH:MM)
function trig(f, h, m) {
  ScriptApp.newTrigger(f).timeBased().atHour(h).nearMinute(m).everyDays(1)
    .create();
  Logger.log("trig function called");
}

// Show the date and time
function shdt() {
  var d = new Date();
  var day = ["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()];
  var hour = d.getHours();   if(hour<10) hour = "0"+hour;
  var min = d.getMinutes();  if(min<10)  min  = "0"+min;
  return day+" "+hour+":"+min;
}

// Show the last shiftstart time
function shsh0() {
  var s = ScriptProperties.getProperty("shiftstart");
  if(s==null) s = "never";
  //Logger.log(s);
  return s;  
}

// Show the last shiftend time (used in allset.html)
function shsh1() {
  var s = ScriptProperties.getProperty("shiftend");
  if(s==null) s = "never";
  //Logger.log(s);
  return s;  
}

// http://stackoverflow.com/questions/3115982/how-to-check-javascript-array-equa
function arraysEqual(a, b) {
  if(a === b) return true;
  if(a == null || b == null) return false;
  if(a.length != b.length) return false;
  a.sort();
  b.sort();
  for(var i = 0; i < a.length; i++) { if(a[i] !== b[i]) return false; }
  return true;
}

// Special function that gets run when this is deployed as a web app
function doGet() {
  var t = ScriptApp.getProjectTriggers(); // was getScriptTriggers
  if(arraysEqual(t.map(function(x){ return x.getHandlerFunction(); }), 
                 ["shiftaroo", "cleanup", "noonshift", 
                  "snzlDel", "snzlAdd"])) {
    Logger.log("Triggers already set up");
  } else { // delete all triggers from last time we ran this script
    var n = t.length;
    for(var i=0; i < n; i++) {
      Logger.log("Deleting trigger: id "+t[i].getUniqueId()
                       +", source "     +t[i].getTriggerSourceId()
                       +", func "       +t[i].getHandlerFunction()
                       +", eventtype "  +t[i].getEventType());
      //if(t[i].getTriggerSource() == ScriptApp.EventType.CLOCK) {}
      ScriptApp.deleteTrigger(t[i]);
    }
    trig("shiftaroo", 00, 00);
    trig("cleanup",   01, 00);
    trig("noonshift", 12, 00);
    trig("snzlDel",   13, 00);
    trig("snzlAdd",   14, 00);
    trig("snzlDel",   15, 00);
    trig("snzlAdd",   16, 00);
    trig("snzlDel",   17, 00);
    trig("snzlAdd",   18, 00);
    trig("snzlDel",   19, 00);
    trig("snzlAdd",   20, 00);
    trig("snzlDel",   21, 00);
    trig("snzlAdd",   22, 00);
    trig("snzlDel",   23, 00);
    trig("snzlAdd",   23, 30);
  }
  
  return HtmlService.createTemplateFromFile('allset').evaluate();
}

// Label to Integer: take a string with prefix, strip the prefix, parse as int
function l2i(s, pre) {
  pre = (typeof pre === "undefined") ? "" : pre;
  return parseInt(s.substr(pre.length)); 
}

// Return labels of the form prefixNN where NN is an integer, sorted numerically
function intlabels(prefix) {
  prefix = (typeof prefix === "undefined") ? "" : prefix;
  var l = GmailApp.getUserLabels();
  var ls = l.map(function(x){ return x.getName(); }); // label names (strings)
  var nh = {}; // name hash: maps string name of the label to label object
  for(var i = 0; i < l.length; i++) nh[ls[i]] = l[i];
  var re = new RegExp('^'+prefix+'\\d+$');
  return ls.filter(function(x){ return x.match(re); })
   .sort(function(a,b){ l2i(a, prefix) - l2i(b, prefix); })
   .map(function(x){ return nh[x]; });
}

// For all threads with label la, remove label la and add label lb
function labelmove(la, lb) {
  var page;
  do {
    page = la.getThreads(0,BATCH);
    if(page.length > 0) {
      lb.addToThreads(page);      // important to add label lb first in case the 
      la.removeFromThreads(page); //   script is killed after removing label la
    }
  } while(page.length==BATCH); // get threads in pages of BATCH at a time
}

// For all threads with label l, remove label l and add to the inbox
// (similar to labelmove function above)
function labeltoinbox(l) {
  var page;
  do {
    page = l.getThreads(0,BATCH);
    if(page.length > 0) {
      GmailApp.moveThreadsToInbox(page); // order of these two lines
      l.removeFromThreads(page);         //   is important (see labelmove func)
    }
  } while(page.length==BATCH);
}

// For all threads with label l, remove them from the inbox (and keep label l)
function labelfrominbox(l) {
  var page = null;
  for(var i = 0; page == null || page.length == BATCH; i += BATCH) {
    page = l.getThreads(i,BATCH);
    if(page.length > 0) GmailApp.moveThreadsToArchive(page);
  }
}

// Remove empty integer labels, except 0-9:
function cleanup() {
  var all = intlabels();
  var page; // an array of threads
  for(var i = 0; i < all.length; ++i) {
    page = all[i].getThreads(0,1);
    if(page.length==0 && all[i].getName().length > 1) all[i].deleteLabel();
  }
}

// Shifts integer labels N to N-1, assuming that "1" is already emptied.
// So first do the base shift from "1" to inbox, then call this.
function genshift(ll) { // takes list of labels, ll
  var hil = {}; // hash from integer to label object
  var l;        // the actual integer for the current label
  for(var i = 0; i < ll.length; i++) {
    l = parseInt(ll[i].getName());
    hil[l] = ll[i];
    if(l <= 1) continue;
    if(!hil[l-1]) hil[l-1] = GmailApp.createLabel(""+(l-1));
    labelmove(hil[l], hil[l-1]);
    //Utilities.sleep(1000); // times out with this; complains without it
    //ScriptProperties.setProperty("maxl", l);
  }
}

// Whether thread t has an integer label
function hasIntLabel(t) {
  var labels = t.getLabels();  
  var re = new RegExp('^\\d+$');
  for(var j = 0; j < labels.length; j++) {
    if(labels[j].getName().match(re)) return true;
  }
  return false;
}

// Remove snooze label from threads neither in inbox nor with integer label
function snzlDel() {
  if(!SNZL && SNZL.length == 0) return;
  var snz = GmailApp.getUserLabelByName(SNZL);
  if(!snz) return;
  var page;
  do {
    page = snz.getThreads(0,BATCH);
    for(var i = 0; i < page.length; i++)
      if(!hasIntLabel(page[i]) && !page[i].isInInbox()) 
        snz.removeFromThread(page[i]);
  } while(page.length==BATCH); // get SNZL threads in pages of BATCH at a time
}

// Add snooze label to integer-labeled threads (optionally pass in list of intlabels)
function snzlAdd(labels) {
  labels = (typeof labels === "undefined") ? intlabels() : labels;
  if(!SNZL && SNZL.length == 0) return;
  var snz = GmailApp.getUserLabelByName(SNZL);
  if(!snz) snz = GmailApp.createLabel(SNZL);
  var page;
  for(var i = 0; i < labels.length; i++) {
    do {
      page = labels[i].getThreads(0,BATCH);
      for(var j = 0; j < page.length; j++) snz.addToThread(page[j]);
    } while(page.length==BATCH);
  }    
}

// ------------------------------------------------------------ (80 chars) ---->
// Shift snooze labels; ..., 3->2, 2->1, 1->inbox (triggered nightly)
function shiftaroo() {
  // Google says ScriptProperties is deprecated...
  //ScriptProperties.setProperty("checkt", Date.now());
  //ScriptProperties.setProperty("maxl", 0);
  ScriptProperties.setProperty("shiftstart", shdt());
  var all = intlabels();
  if(all.length===0) return;
  if(l2i(all[0].getName()) == 0) all.shift(); // ignore the zero label
  if(all.length===0) return;
  if(l2i(all[0].getName()) == 1) labeltoinbox(all[0]);
  //ScriptProperties.setProperty("maxl", 1);
  genshift(all);
  ScriptProperties.setProperty("shiftend", shdt());
}

// Shift snooze labels back the other way (except inbox), for testing
// WARNING: currently broken! it sends 1 to 2 and then 2 to 3, etc so
// they all bunch up at the last label before a gap.
// Will probably work as intended by walking through intlabels() in 
// reverse order.
function shiftbackBROKEN() {
  var all = intlabels();
  if(all.length===0) return;
  if(l2i(all[0].getName()) == 0) all.shift();
  if(all.length===0) return;

  var hil = {}; // hash from integer to label object
  var l;        // the actual integer for the current label
  for(var i = 0; i < all.length; i++) {
    l = l2i(all[i].getName());
    hil[l] = all[i];
    if(l < 1) continue;
    if(!hil[l+1]) hil[l+1] = GmailApp.createLabel(l+1);
    labelmove(hil[l], hil[l+1]);
  }  
}

// Shift snooze labels back the other way (except inbox), for testing
function shiftback() {
  //var all = intlabels();
  //if(all.length===0) return;
  //if(l2i(all
}

// Shift snooze label 0 to inbox, triggered daily at noon
function noonshift() {
  var z = GmailApp.getUserLabelByName("0");
  if(!z) return;
  labeltoinbox(z);
}

// Return a summary string of the number of messages with each snooze label
function tally() {
  var all = intlabels();
  //snzlDel();     // Would make sense to do this but too slow...
  //snzlAdd(all);
  var d = new Date();
  var h = d.getHours();
  if(h>=12 && all.length>=2 && l2i(all[0].getName())==0 
                            && l2i(all[1].getName())==1) {
    var x = all.shift();
    var y = all.shift();
    all.unshift(y, x);      // if after noon, show label 0 after label 1
  }
  // the string s will be an ascii table of thread counts and cumulative counts
  var s = "SNZ\tTHR\tTOT\n\t";
  var page;
  page = GmailApp.getInboxThreads(0,100);
  var n = page.length;
  var cum = n;
  var initcount = '' + n + (n==100 ? "+" : "");
  s += initcount + "\t" + initcount + "\n";
  
  for(var i = 0; i < all.length; i++) {
    var ln = all[i].getName(); // label's name
    var l  = all[i];           // actual label object
    if(!l) { s += " ERROR with label "+ln; continue; }
    s += "" + ln + "\t";
    n = l.getThreads(0,100).length;
    cum += n;
    s += n + (n==100 ? "+" : "") + "\t" + cum + "\n";
  }
  return s;
  //MailApp.send Email(Session.get User().get Email(), "SnoozeStats", s);
}


////////////////////////////////////////////////////////////////////////////////
////////////////////////////// UNUSED STUFF BELOW //////////////////////////////
////////////////////////////////////////////////////////////////////////////////

// For all threads with label la, add label lb as well
function labelcopy(la, lb) {
  var page;
  do {
    page = la.getThreads(0,BATCH);
    if(page.length > 0) lb.addToThreads(page);
  } while(page.length==BATCH); // get threads in pages of BATCH at a time
}

// Returns the max integer label, or label of the form prefixNN with max NN
function smax(prefix) {
  prefix = (typeof prefix === "undefined") ? "" : prefix;
  var all = GmailApp.getUserLabels();
  var smax = 0, s, x;
  var re = new RegExp('^'+prefix+'\\d+$')
  for(var i = 0; i < all.length; i++) {
    s = all[i].getName();
    if(s.match(re)) {
      x = parseInt(s.substr(prefix.length));
      if(x > smax) smax = x;
    }
  }
  return smax;  
}

// Number of significant digits of an integer
//function sigfigsInt(x) { return ((''+x).replace(/0*$/, '')).length; }

// Similar to shiftaroo but for auto-expire (triggered nightly)
// ..., x3->x2, x2->x1, x1->x (and out of inbox when it hits just "x")
//function exparoo() {
//  var prefix = "x";
//  var all = intlabels(prefix);
//  if(all.length===0) return;  
//  if(l2i(all[0].getName(), prefix) == 0) all.shift();
//  if(all.length===0) return;
//  if(l2i(all[0].getName(), prefix) == 1) {
//    x = GmailApp.getUserLabelByName(prefix);
//    if(!x) x = GmailApp.createLabel(prefix);
//    labelfrominbox(all[0]);  // first get all these x1 threads out of the inbox
//    labelmove(all[0], x);    // then remove the label x1 and add the label x
//  }
//  genshift(all, prefix);
//}

// Remove empty labels of the form prefixNN, except 0-9:
//function cleanupOld(prefix) {
//  prefix = (typeof prefix === "undefined") ? "" : prefix;
//  var all = intlabels(prefix);
//  var page; // an array of threads
//  for(var i = 0; i < all.length; ++i) {
//    page = all[i].getThreads(0,1);
//    if(page.length==0 && all[i].getName().length - prefix.length > 1)
//      all[i].deleteLabel();
//  }
//}
