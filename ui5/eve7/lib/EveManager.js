/// @file EveManager.js
/// used only together with OpenUI5

// TODO: add dependency from JSROOT components

sap.ui.define([], function() {

   "use strict";

   // JSROOT.sources.push("evemgr");

   /** @namespace JSROOT.EVE */
   /// Holder of all EVE-related functions and classes
   JSROOT.EVE = {};

   function EveManager()
   {
      this.map    = {}; // use object, not array
      this.childs = [];
      this.last_json = null;
      this.scene_changes = null;

      this.hrecv = []; // array of receivers of highlight messages

      this.scenes = [];  // list of scene objects

      // Set through Update Trigger UT_Refresh_Selection_State and name match
      // upon arrival of EveWorld. See also comments there.
      this.global_selection_id = null;
      this.global_highlight_id = null;

      this.EChangeBits = { "kCBColorSelection": 1, "kCBTransBBox": 2, "kCBObjProps": 4, "kCBVisibility": 8,  "kCBAdded": 16 };

      this.controllers = [];
      this.gl_controllers = [];
      this.selection_change_foos = [];

      this.initialized = false;
      this.busyProcessingChanges = false;
   }


   //==============================================================================
   // BEGIN protoype functions
   //==============================================================================

   /** Returns element with given ID */
   EveManager.prototype.GetElement = function(id)
   {
      // AMT todo ... I think this check should be optional
      if (id in this.map)
	 return this.map[id];
      else
	 return undefined;
   }

   /** Attach websocket handle to manager, all communication runs through manager */
   EveManager.prototype.UseConnection = function(handle)
   {
      this.handle = handle;

      handle.SetReceiver(this);
      handle.Connect();
   }

   EveManager.prototype.OnWebsocketClosed = function() {
      for (var i = 0; i < this.controllers.length; ++i) {
         if (typeof this.controllers[i].onDisconnect !== "undefined") {
            this.controllers[i].onDisconnect();
         }
      }
   }

   EveManager.prototype.OnWebsocketOpened = function() {
      // console.log("opened!!!");
   },

   EveManager.prototype.RegisterController = function (c)
   {
      this.controllers.push(c);
   }

   EveManager.prototype.RegisterGlController = function (c)
   {
      this.gl_controllers.push(c);
   }

   EveManager.prototype.RegisterSelectionChangeFoo = function(arg)
   {
      this.selection_change_foos.push(arg);
   }

   /** Called when data comes via the websocket */
   EveManager.prototype.OnWebsocketMsg = function(handle, msg, offset)
   {
      // if (this.ignore_all) return;

      if (typeof msg != "string")
      {
         // console.log('ArrayBuffer size ',
         // msg.byteLength, 'offset', offset);
         this.ImportSceneBinary(msg, offset);

         return;
      }

      // console.log("OnWebsocketMsg msg len=", msg.length, " txt:", msg.substr(0,120), "...");

      let resp = JSON.parse(msg);

      if (resp === undefined)
      {
         console.log("OnWebsocketMsg can't parse json: msg len=", msg.length, " txt:", msg.substr(0,120), "...");
         return;
      }

      else if (resp[0] && resp[0].content == "REveScene::StreamElements")
      {
         this.ImportSceneJson(resp);
      }
      else if (resp.header && resp.header.content == "ElementsRepresentaionChanges")
      {
         this.ImportSceneChangeJson(resp);
      }
      else if (resp.content == "BeginChanges")
      {
         this.listScenesToRedraw = [];
         this.busyProcessingChanges = true;
      }
      else if (resp.content == "EndChanges")
      {
         this.ServerEndRedrawCallback();
         return;
      }
      else
      {
         console.log("OnWebsocketMsg Unhandled message type: msg len=", msg.length, " txt:", msg.substr(0,120), "...");
      }
   }


   EveManager.prototype.SendMIR = function(mir)
   {
      if (!mir || ! this.handle) return;

      if (this.handle.kind != "file")
         this.handle.Send(JSON.stringify(mir));
   }

   /** Configure receiver for scene-respective events. Following event used:
    * onSceneChanged */
   EveManager.prototype.RegisterSceneReceiver = function(id, receiver, func_name) {

      var elem = this.GetElement(id);

      if (!elem) return;

      if (!elem.$receivers) elem.$receivers = [];

      if (elem.$receivers.indexOf(receiver)<0)
         elem.$receivers.push(receiver);
   }

   /** Invoke function on all receiver of scene events - when such function exists */
   EveManager.prototype.callSceneReceivers = function (scene, fname, arg) {
      if (scene.$receivers) {
          for (var i=0; i < scene.$receivers.length; i++) {
              var receiver = scene.$receivers[i];
              if (typeof receiver[fname] == "function")
                 receiver[fname](arg);
          }
      }
  }

   EveManager.prototype.ImportSceneJson = function(arr)
   {
      this.last_json = null;
      // console.log("ImportSceneJson JSON", arr[0]);

      // remember commands in manager
      if (arr[0].commands && !this.commands)
         this.commands = arr[0].commands;

      if (arr[0].fTotalBinarySize)
         this.last_json = arr;

      for (var n = 1; n < arr.length; ++n)
      {
         var elem = arr[n];

         var obj = this.map[elem.fElementId];

         if ( ! obj) // YYYY isn't it an error if obj exists?
         {
            // element did not exist up to now
            var parent = null;
            if (elem.fMotherId !== 0) {
               parent = this.map[elem.fMotherId];
            } else {
               parent = this;
            }
            if (!parent) {
               console.error('Parent object ' + elem.fMotherId + ' does not exists - why?');
               return;
            }

            if (parent.childs === undefined)
               parent.childs = [];

            parent.childs.push(elem);

            // YYYY why?
            obj = this.map[elem.fElementId] = elem;
         }

         this.ParseUpdateTriggersAndProcessPostStream(elem);

      }

      if (arr[0].fTotalBinarySize == 0) {
         console.log("scene imported ", this.map[arr[0].fSceneId]);
         this.sceneImportComplete(arr[0]);
      }

   }

   //______________________________________________________________________________

   EveManager.prototype.RecursiveRemove = function(elem, delSet) {
      var elId = elem.fElementId;
      var motherId = elem.fMotherId;

      // iterate children
      if (elem.childs !== undefined) {
         while (elem.childs.length > 0) {
            var n = 0;
            var sub = elem.childs[n];
            this.RecursiveRemove(sub, delSet);
         }
      }

      // delete myself from mater
      var mother = this.GetElement(motherId);
      var mc = mother.childs;
      for (var i = 0; i < mc.length; ++i) {

         if (mc[i].fElementId === elId) {
            mc.splice(i, 1);
         }
      }

      delete this.map[elId];
      delSet.delete(elId);

     // console.log(" ecursiveRemove END", elId, delSet);
     // delete elem;
   }

   //______________________________________________________________________________

   EveManager.prototype.ImportSceneChangeJson = function(msg)
   {
      var arr = msg.arr;
      this.last_json = null;
      this.scene_changes = msg;

      var scene = this.GetElement(msg.header.fSceneId);
      // console.log("ImportSceneChange", scene.fName, msg);

      // notify scenes for beginning of changes and
      // notify for element removal
      var removedIds = msg.header["removedElements"]; // AMT empty set should not be sent at the first place
      if (removedIds.length)
         this.callSceneReceivers(scene, "elementsRemoved", removedIds);

      var delSet = new Set();
      for (var r = 0; r < removedIds.length; ++r) {
         var id  = removedIds[r];
         delSet.add(id);
      }
     // console.log("start with delSet ", delSet);
      while (delSet.size != 0) {
         var it = delSet.values();
         var id = it.next().value;
         // console.log("going to call RecursiveRemove .... ", this.map[id]);
         this.RecursiveRemove(this.GetElement(id), delSet);
         // console.log("complete RecursiveREmove ", delSet);
      }

      // wait for binary if needed
      if (msg.header.fTotalBinarySize)
      {
          this.last_json = [1];
          for (var i = 0; i < arr.length; ++i)
              this.last_json.push(arr[i]);

      } else {
         this.CompleteSceneChanges();
      }
   }

   //______________________________________________________________________________


   EveManager.prototype.CompleteSceneChanges = function()
   {
      if (!this.scene_changes) return;

      var arr = this.scene_changes.arr;
      var header = this.scene_changes.header;
      var scene = this.GetElement(header.fSceneId);
      var nModified = header["numRepresentationChanged"];

      // first import new elements in element map
      for (var n=0; n<arr.length; ++n)
      {
         var em = arr[n];
         if (em.changeBit & this.EChangeBits.kCBAdded) {
            this.map[em.fElementId] = em;
         }
      }

      for (var n=0; n<arr.length; ++n)
      {
         var em = arr[n];

         em.tag = "changeBit";
         if (em.changeBit & this.EChangeBits.kCBAdded) {
             // create new
            var parent = this.map[em.fMotherId];
            if (!parent.childs) // YYYY do we really need to create arrays here? Can it really be undef?
               parent.childs = [];
            parent.childs.push(em);

            this.ParseUpdateTriggersAndProcessPostStream(em);
            this.callSceneReceivers(scene, "elementAdded", em);
            continue;
         }

         // merge new and old element
         var obj = this.map[em.fElementId];
         if(!obj) {
            console.log("ERRROR can't find element in map ", em); continue;
         }


         if (em.changeBit & this.EChangeBits.kCBVisibility)
         {
            if (obj.fRnrSelf != em.fRnrSelf) {
               obj.fRnrSelf = em.fRnrSelf;
               em.rnr_self_changed = true;
            }
            if (obj.fRnrChildren != em.fRnrChildren) {
               obj.fRnrChildren = em.fRnrChildren;
               em.rnr_children_changed = true;
            }
         }

         if (em.changeBit & this.EChangeBits.kCBObjProps) {
            delete obj.render_data;
	    // AMT note ... the REveSelection changes fall here
	    // I think this should be a separate change bit
            delete obj.sel_list;
            jQuery.extend(obj, em);
            this.ParseUpdateTriggersAndProcessPostStream(obj);
         }
         else if (em.changeBit & this.EChangeBits.kCBColorSelection) {
            delete em.render_data;
            JSROOT.extend(obj, em);
         }

         this.callSceneReceivers(scene, "sceneElementChange", em);
      }

      this.listScenesToRedraw.push(scene);
      this.scene_changes = null;
   },

   //______________________________________________________________________________

   EveManager.prototype.FindViewers = function(chlds) {
      if (chlds === undefined) chlds = this.childs;

      for (var k=0;k<chlds.length;++k) {
         if (!chlds[k].childs) continue;
         if (chlds[k]._typename == "ROOT::Experimental::REveViewerList") return chlds[k].childs;
         var res = this.FindViewers(chlds[k].childs);
         if (res) return res;
      }
   }

   EveManager.prototype.ImportSceneBinary = function(rawdata, offset) {

      if (!this.last_json || !rawdata || !rawdata.byteLength) return;

      var arr = this.last_json;
      this.last_json = null;

      var lastoff = offset;

      for (var n=1; n<arr.length;++n) {
         var elem = arr[n];

         if (!elem.render_data) continue;

         var rd = elem.render_data,
             off = offset + rd.rnr_offset,
             obj = this.GetElement(elem.fElementId);

         if (off !== lastoff)
            console.error('Element ' + elem.fName + ' offset mismatch ' + off + ' != ' + lastoff);

         if (rd.trans_size) {
            rd.matrix = new Float32Array(rawdata, off, rd.trans_size);
            off += rd.trans_size*4;
         }
         if (rd.vert_size) {
            rd.vtxBuff = new Float32Array(rawdata, off, rd.vert_size);
            off += rd.vert_size*4;
         }

         if (rd.norm_size) {
            rd.nrmBuff = new Float32Array(rawdata, off, rd.norm_size);
            off += rd.norm_size*4;
         }

         if (rd.index_size) {
            rd.idxBuff = new Uint32Array(rawdata, off, rd.index_size);
            off += rd.index_size*4;
         }

         lastoff = off;
      }

      if (lastoff !== rawdata.byteLength)
         console.error('Raw data decoding error - length mismatch', lastoff, rawdata.byteLength);

      if (this.scene_changes)
         this.CompleteSceneChanges();
      else
         this.sceneImportComplete(arr[0]);
   }


   EveManager.prototype.sceneImportComplete = function(msg)
   {
      // call controllers when all the last scene is imported
      let world     = this.map[1];
      let scenes    = world.childs[2];
      let lastChild = scenes.childs.length -1;

      if (scenes.childs[lastChild].fElementId == msg.fSceneId)
      {
         for (let i = 0; i < this.controllers.length; ++i)
         {
            this.controllers[i]["OnEveManagerInit"]();
         }
      }
   },

   //------------------------------------------------------------------------------
   // XXXX UT = UpdateTrigger functions. XXXX Can /should we place them
   // somewhere else?
   // ------------------------------------------------------------------------------

   EveManager.prototype.ParseUpdateTriggersAndProcessPostStream = function(el)
   {
      // console.log("EveManager.ParseUpdateTriggersAndProcessPostStream", el.UT_PostStream, this[el.UT_PostStream]);

      if (el.UT_PostStream !== undefined && typeof this[el.UT_PostStream] == "function")
      {
         this[el.UT_PostStream](el);
         delete el.UT_PostStream
      }
      // XXXX This is called before renderdata. Do we really need post stream or is PostScene
      //      sufficient? Think.

      // XXXX MT check also for PostScene and PostUpdate, put them somewhere and delete them.
   }

   EveManager.prototype.UT_Selection_Refresh_State = function(sel)
   {
      // sel - rep of a REveSelection object.

      // console.log("UpdateTrigger UT_Selection_Refresh_State called for ", sel.fName);

      // XXXX Hack to assign global selection / highlight ids.
      // This would be more properly done by having REveWorld : public REveScene and store
      // ids there. These will also be needed for viewers, scenes, cameras etc.
      // I somewhat dislike setting this through name match (and class::WriteCoreJson() as
      // it defines the UT function so we sort of know what kind of objects this function
      // will be called for.
      // We shall see -- but it would better be soon as things are getting messy :)
      //
      if (sel._is_registered === undefined)
      {
         if (sel.fName == "Global Selection") this.global_selection_id = sel.fElementId;
         if (sel.fName == "Global Highlight") this.global_highlight_id = sel.fElementId;
         sel._is_registered = true;
         sel.prev_sel_list  = sel.sel_list;
         return;
      }

      var oldMap = new Map();
      sel.prev_sel_list.forEach(function(rec) {
         let iset = new Set(rec.sec_idcs);
         let x    = { "valid": true, "implied": rec.implied, "set": iset };
         oldMap.set(rec.primary, x);
      });

      // XXXXX MT - make sure to not process elements that do not have a representation in this manager.
      // Both for select and unselect.
      // I probably can't just throw them out, especially not for the selection primary as it is used
      // as a key.

      var newMap = new Map();
      sel.sel_list.forEach(function(rec) {
         let iset = new Set(rec.sec_idcs);
         let x    = { "valid": true, "implied": rec.implied, "set": iset };
         newMap.set(rec.primary, x);
      });

      // remove identicals from old and new map
      for (let id in oldMap)
      {
         if (id in newMap)
         {
            let oldSet = oldMap[id].set;
            let newSet = newMap[id].set;

            let nm = 0;
            for (let elem of oldSet)
            {
               if (newSet.delete(elem)) {
                  nm++;
               }
            }

            // invalidate if sets are empty or identical
            if (nm == oldSet.length && newSet.length == 0)
            {
               oldMap[id].valid = false;
               newMap[id].valid = false;
               // console.log("EveManager.prototype.UT_Selection_Refresh_State identical sets for primary", id);
            }
         }
      }

      var changedSet = new Set();
      for (var [id, value] of oldMap.entries())
      {
         if (JSROOT.EVE.DebugSelection)
            console.log("UnSel prim", id, this.GetElement(id), this.GetElement(id).fSceneId);

         this.UnselectElement(sel, id);
         var iel = this.GetElement(id);
         changedSet.add(iel.fSceneId);

         for (var imp of value.implied)
         {
            if (JSROOT.EVE.DebugSelection)
               console.log("UnSel impl", imp, this.GetElement(imp), this.GetElement(imp).fSceneId);

            this.UnselectElement(sel, imp);
            changedSet.add(this.GetElement(imp).fSceneId);
         }
      }

      for (var [id, value] of newMap.entries())
      {
         if (JSROOT.EVE.DebugSelection)
            console.log("Sel prim", id, this.GetElement(id), this.GetElement(id).fSceneId);

         var secIdcs = Array.from(value.set);
         var iel = this.GetElement(id);
         if ( ! iel) {
            console.log("EveManager.prototype.UT_Selection_Refresh_State this should not happen ", iel);
            continue;
         }
         changedSet.add(iel.fSceneId);
         this.SelectElement(sel, id, secIdcs);

         for (var imp of value.implied)
         {
            if (JSROOT.EVE.DebugSelection)
               console.log("Sel impl", imp, this.GetElement(imp), this.GetElement(imp).fSceneId);

            this.SelectElement(sel, imp, secIdcs);
            changedSet.add(this.GetElement(imp).fSceneId);
         }
      }

      sel.prev_sel_list = sel.sel_list;
      sel.sel_list      = [];

      // XXXXX handle outline visible/hidden color changes
      // Should I check for change? Do I have old values?
      // Also ... check how this is done on init.
      // And think how to do it for multiple selections / connections
      // -----
      for (let foo of this.selection_change_foos)
      {
         // XXXX Need to be smarter, pass which selection has changed.
         // But also need some support for more of them and their handling.
         foo(this);
      }

      // redraw
      for (let item of changedSet)
      {
         let scene = this.GetElement(item);
         // this.callSceneReceivers(scene, "endChanges");
         this.listScenesToRedraw.push(scene);
      }

      // XXXX Oh, blimy, on first arrival, if selection is set, the selected
      // elements have not yet been received and so this will fail. Also true
      // for newly subscribed scenes, once we start supporting this.
      // So, we need something like reapply selections after new scenes arrive.
   }

   EveManager.prototype.SelectElement = function(selection_obj, element_id, sec_idcs)
   {
      let element = this.GetElement(element_id);
      if ( ! element) return;

      let scene = this.GetElement(element.fSceneId);

      for (let r of scene.$receivers)
      {
         r.SelectElement(selection_obj, element_id, sec_idcs);
      }

      // console.log("EveManager.SelectElement", element, scene.$receivers[0].viewer.outline_pass.id2obj_map);
   }

   EveManager.prototype.UnselectElement = function(selection_obj, element_id)
   {
      let element = this.GetElement(element_id);
      if ( ! element) return;

      let scene = this.GetElement(element.fSceneId);

      for (let r of scene.$receivers)
      {
         r.UnselectElement(selection_obj, element_id);
      }

      // console.log("EveManager.UnselectElement", element, scene.$receivers[0].viewer.outline_pass.id2obj_map);
   }

   EveManager.prototype.ServerEndRedrawCallback = function()
   {
      // console.log("ServerEndRedrawCallback ", this.listScenesToRedraw);
      var recs = new Set();
      for ( var i =0; i < this.listScenesToRedraw.length; i++) {
         var scene = this.listScenesToRedraw[i];
         if (scene.$receivers) {
            for (var r=0; r < scene.$receivers.length; r++) {
               recs.add( scene.$receivers[r]);
            }
         }
      }
      for (let item of recs) {
         item.endChanges();
      }

      this.busyProcessingChanges = false;
   }


   //==============================================================================
   // END protoype functions
   //==============================================================================

   JSROOT.EVE.EveManager = EveManager;

   JSROOT.EVE.DebugSelection = 0;

   return EveManager;

});

// Matevz's notes ... here for lack of better ideas.
//
// 1. elementid, fElementId, eveId --> this is ultra confusing, decide and use consistently.
//    Maybe also on the eve side. m_eid ?
//    Ditto for fMasterId, mstrId, something else, probably
