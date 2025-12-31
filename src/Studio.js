// Studio.js (FULL PATCHED FILE - based on the Studio.js you pasted)

import Loader from "./Plugin/Loader.js";
import Components from "./Plugin/Components.js";
import Layout from "./Layout.js";
import WebGL from "./WebGL.js";
import Status from "./Status.js";
import Save from "./Save.js";
import Menu from "./Menu.js";
import StudioScene from "./Scene/StudioScene.js";
import CheckboxType from "./Menu/Types/CheckboxType.js";
import Category from "./Menu/Category.js";
import SceneMap from "./Scene/SceneMap.js";
import ActionType from "./Menu/Types/ActionType.js";
import Keyboard from "./Keyboard.js";
import Mouse from "./Mouse.js";
import Games from "./Plugin/Games.js";
import Grf from "./Plugin/Builder/Game/ManhuntGeneric/Grf.js";
import Route from "./Waypoints/Route.js";
import Result from "./Plugin/Loader/Result.js";
import Waypoints from "./Waypoints.js";
import Inst from "./Plugin/Builder/Game/ManhuntGeneric/Inst.js";
import Insert from "./Transfer/Insert.js";
import Dff from "./Plugin/Builder/Game/Manhunt/Dff.js";
import Glg from "./Plugin/Builder/Game/ManhuntGeneric/Glg.js";
import Txd from "./Plugin/Builder/Game/Manhunt/Txd.js";
import Col from "./Plugin/Builder/Game/ManhuntGeneric/Col.js";
import SceneModel from "./Scene/SceneModel.js";
import OBJExporter from "./Vendor/OBJExporter.js";

import {
    Box3,
    Vector3,
    Mesh,
    MeshBasicMaterial,
    BoxGeometry
} from "./Vendor/three.module.js";

export default class Studio {

    /**
     *
     * @type {Menu|null}
     */
    static menu = null;

    static FOV = 57.29578; //Default MH2 FOV

    /**
     * Global {Result} types for the {Storage} class
     */
    static MAP = 1;
    static MODEL = 2;
    static GLG = 3;
    static ANIMATION = 4;
    static INST = 5;
    static TEXTURE = 6;
    static TVP = 7;
    static ENTITY = 8;
    static MLS = 9;
    static WORLD = 10;
    static IMPORTED = 11;
    static FILE = 12;
    static AREA_LOCATION = 13;
    static WAYPOINT_ROUTE = 14;
    static WAYPOINT_STOPPER = 15;
    static COLLISION = 16;

    /**
     *
     * @type {Result|null}
     */
    static clipboard = null;
    static copyCount = 0;

    // ============================================================
    // Placeholder model system (entities with no model / no mesh)
    // ============================================================

    static _placeholderSelectionByContext = {};    // key => { name: string|null, type: number|null }
    static _placeholderPrototypeCache = {};        // key => Object3D/Mesh|null

    static _placeholderContextKey(gameId, level) {
        return `studio.placeholderModel.${gameId}.${level}`;
    }

    static _readLocalStorage(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    static _writeLocalStorage(key, valueOrNull) {
        try {
            if (valueOrNull === null || valueOrNull === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, valueOrNull);
        } catch (e) { }
    }

    static hasPlaceholderModelSelection(sceneMap) {
        if (!(sceneMap instanceof SceneMap)) return false;

        const key = Studio._placeholderContextKey(sceneMap.mapEntry.gameId, sceneMap.mapEntry.level);
        const mem = Studio._placeholderSelectionByContext[key];
        if (mem && (mem.name !== undefined)) return true;

        const raw = Studio._readLocalStorage(key);
        return raw !== null && raw !== "";
    }

    static _getPlaceholderSelection(sceneMap) {
        const key = Studio._placeholderContextKey(sceneMap.mapEntry.gameId, sceneMap.mapEntry.level);

        if (Studio._placeholderSelectionByContext[key] && Studio._placeholderSelectionByContext[key].name !== undefined) {
            return Studio._placeholderSelectionByContext[key];
        }

        const raw = Studio._readLocalStorage(key);
        if (!raw) {
            Studio._placeholderSelectionByContext[key] = { name: null, type: null };
            return Studio._placeholderSelectionByContext[key];
        }

        // stored as "type|name" or just "name"
        let type = null;
        let name = raw;

        const pipe = raw.indexOf("|");
        if (pipe !== -1) {
            const left = raw.substring(0, pipe);
            const right = raw.substring(pipe + 1);
            const t = parseInt(left, 10);
            if (!Number.isNaN(t)) type = t;
            name = right;
        }

        Studio._placeholderSelectionByContext[key] = { name: name, type: type };
        return Studio._placeholderSelectionByContext[key];
    }

    static _setPlaceholderSelection(sceneMap, nameOrNull, typeOrNull) {
        const key = Studio._placeholderContextKey(sceneMap.mapEntry.gameId, sceneMap.mapEntry.level);

        Studio._placeholderSelectionByContext[key] = { name: nameOrNull, type: typeOrNull };
        Studio._placeholderPrototypeCache[key] = undefined;

        if (nameOrNull === null || nameOrNull === undefined) {
            Studio._writeLocalStorage(key, null);
        } else {
            const stored = (typeOrNull !== null && typeOrNull !== undefined) ? `${typeOrNull}|${nameOrNull}` : `${nameOrNull}`;
            Studio._writeLocalStorage(key, stored);
        }
    }

    static _safeFindBy(game, queryObj) {
        try {
            if (game && typeof game.findBy === "function") return game.findBy(queryObj) || [];
        } catch (e) { }
        return [];
    }

    static _uniqueByName(results) {
        const map = {};
        const out = [];
        results.forEach((r) => {
            if (!r || !r.name) return;
            if (map[r.name]) return;
            map[r.name] = true;
            out.push(r);
        });
        return out;
    }

    static _getPlaceholderCandidates(sceneMap) {
        const game = Games.getGame(sceneMap.mapEntry.gameId);
        const level = sceneMap.mapEntry.level;

        // priority: MODEL/IMPORTED first, then ENTITY
        let candidates = [];

        candidates = candidates.concat(Studio._safeFindBy(game, { type: Studio.MODEL, level: level }));
        candidates = candidates.concat(Studio._safeFindBy(game, { type: Studio.MODEL }));

        candidates = candidates.concat(Studio._safeFindBy(game, { type: Studio.IMPORTED, level: level }));
        candidates = candidates.concat(Studio._safeFindBy(game, { type: Studio.IMPORTED }));

        candidates = candidates.concat(Studio._safeFindBy(game, { type: Studio.ENTITY, level: level }));

        return Studio._uniqueByName(candidates);
    }

    static _promptPlaceholderModel(sceneMap) {
        const candidates = Studio._getPlaceholderCandidates(sceneMap);

        if (candidates.length === 0) {
            // no options; use cube fallback
            Studio._setPlaceholderSelection(sceneMap, null, null);
            return;
        }

        const maxList = 60;
        const shown = candidates.slice(0, maxList);

        let list = shown.map((c, i) => `${i + 1}: ${c.name}`).join("\n");
        if (candidates.length > maxList) {
            list += `\n... (${candidates.length - maxList} more not shown)`;
        }

        const msg =
            "Some entities have no model and cannot be selected.\n\n" +
            "Choose a placeholder model from already imported entries:\n\n" +
            list +
            "\n\nEnter a number (e.g. 1), a name exactly, or leave empty to use a cube marker.";

        const input = prompt(msg, "1");
        if (input === null) {
            // cancel => keep existing selection if any; otherwise cube
            const cur = Studio._getPlaceholderSelection(sceneMap);
            if (!cur || cur.name === undefined) Studio._setPlaceholderSelection(sceneMap, null, null);
            return;
        }

        const trimmed = String(input).trim();
        if (trimmed === "") {
            Studio._setPlaceholderSelection(sceneMap, null, null);
            return;
        }

        const idx = parseInt(trimmed, 10);
        if (!Number.isNaN(idx) && idx >= 1 && idx <= shown.length) {
            const picked = shown[idx - 1];
            Studio._setPlaceholderSelection(sceneMap, picked.name, picked.type);
            return;
        }

        const byName = candidates.find((c) => c.name === trimmed);
        if (byName) {
            Studio._setPlaceholderSelection(sceneMap, byName.name, byName.type);
        } else {
            // invalid => cube
            Studio._setPlaceholderSelection(sceneMap, null, null);
        }
    }

    static ensurePlaceholderModelSelection(sceneMap, forcePrompt = false) {
        if (!(sceneMap instanceof SceneMap)) return;

        const cur = Studio._getPlaceholderSelection(sceneMap);
        if (forcePrompt || cur.name === undefined) {
            Studio._promptPlaceholderModel(sceneMap);
            return;
        }

        // If no selection stored, prompt once only if asked
        if (forcePrompt && (cur.name === null || cur.name === undefined)) {
            Studio._promptPlaceholderModel(sceneMap);
        }
    }

    static _deepCloneObject3D(root) {
        if (!root || typeof root.clone !== "function") return null;

        const clone = root.clone(true);

        if (typeof clone.traverse === "function") {
            clone.traverse((o) => {
                if (!o || !o.isMesh) return;

                if (o.geometry && typeof o.geometry.clone === "function") {
                    o.geometry = o.geometry.clone();
                }

                if (o.material) {
                    if (Array.isArray(o.material)) {
                        o.material = o.material.map((m) => (m && typeof m.clone === "function") ? m.clone() : m);
                    } else if (typeof o.material.clone === "function") {
                        o.material = o.material.clone();
                    }
                }
            });
        }

        return clone;
    }

    static _normalizeToMaxAxis(root, targetMaxAxis = 0.5) {
        try {
            const box = new Box3().setFromObject(root);
            const size = new Vector3();
            box.getSize(size);

            const maxAxis = Math.max(size.x, size.y, size.z);
            if (maxAxis > 0.00001) {
                const s = targetMaxAxis / maxAxis;
                root.scale.multiplyScalar(s);
            }
        } catch (e) { }
    }

    static _tagEntityRecursive(obj, entityResult) {
        if (!obj) return;

        obj.userData = obj.userData || {};
        obj.userData.entity = entityResult;

        if (typeof obj.traverse === "function") {
            obj.traverse((o) => {
                if (!o) return;
                o.userData = o.userData || {};
                o.userData.entity = entityResult;
            });
        }
    }

    static _makeFallbackCube(size = 0.5) {
        const mesh = new Mesh(
            new BoxGeometry(size, size, size),
            new MeshBasicMaterial({ wireframe: true, color: 0xff11ff })
        );
        mesh.name = "entity_placeholder_cube";
        return mesh;
    }

    static _resolvePlaceholderPrototype(sceneMap) {
        const key = Studio._placeholderContextKey(sceneMap.mapEntry.gameId, sceneMap.mapEntry.level);
        if (Studio._placeholderPrototypeCache[key] !== undefined) return Studio._placeholderPrototypeCache[key];

        const sel = Studio._getPlaceholderSelection(sceneMap);
        if (!sel || !sel.name) {
            Studio._placeholderPrototypeCache[key] = null;
            return null;
        }

        const game = Games.getGame(sceneMap.mapEntry.gameId);
        const level = sceneMap.mapEntry.level;

        let found = null;

        // If sel.type is known, prefer that, else search all candidates by name
        if (sel.type !== null && sel.type !== undefined) {
            const list = Studio._safeFindBy(game, { type: sel.type, level: level })
                .concat(Studio._safeFindBy(game, { type: sel.type }));
            found = list.find((r) => r && r.name === sel.name) || null;
        }

        if (!found) {
            const candidates = Studio._getPlaceholderCandidates(sceneMap);
            found = candidates.find((r) => r && r.name === sel.name) || null;
        }

        if (!found) {
            Studio._placeholderPrototypeCache[key] = null;
            return null;
        }

        // Try to extract a Mesh/Object3D prototype from the selected entry
        let proto = null;

        try {
            if (found.mesh && typeof found.mesh === "object") {
                proto = found.mesh;
            }
        } catch (e) { }

        if (!proto) {
            try {
                if (typeof found.data === "function") {
                    const d = found.data();
                    if (d && typeof d.getMesh === "function") {
                        const m = d.getMesh();
                        if (m && m !== false) proto = m;
                    } else if (d && (d.isObject3D || d.isMesh || d.isGroup)) {
                        proto = d;
                    }
                }
            } catch (e) { }
        }

        Studio._placeholderPrototypeCache[key] = proto || null;
        return Studio._placeholderPrototypeCache[key];
    }

    static createPlaceholderMeshForEntity(sceneMap, entityResult) {
        // Does not prompt; caller controls prompt timing.
        const proto = Studio._resolvePlaceholderPrototype(sceneMap);

        let obj = null;

        if (proto) {
            obj = Studio._deepCloneObject3D(proto);
            if (obj) Studio._normalizeToMaxAxis(obj, 0.5);
        }

        if (!obj) obj = Studio._makeFallbackCube(0.5);

        obj.userData = obj.userData || {};
        obj.userData.isPlaceholder = true;

        // Apply entity transform (best effort; depends on your ENTITY data shape)
        try {
            const ed = (typeof entityResult.data === "function") ? entityResult.data() : null;

            if (ed && ed.position && typeof obj.position?.copy === "function") {
                obj.position.copy(ed.position);
            }

            // rotation could be quaternion-like (x,y,z,w) or euler-like (x,y,z)
            if (ed && ed.rotation) {
                if (ed.rotation.w !== undefined && obj.quaternion && typeof obj.quaternion.set === "function") {
                    obj.quaternion.set(ed.rotation.x, ed.rotation.y, ed.rotation.z, ed.rotation.w);
                } else if (ed.rotation.x !== undefined && obj.rotation && typeof obj.rotation.set === "function") {
                    obj.rotation.set(ed.rotation.x, ed.rotation.y, ed.rotation.z);
                }
            }
        } catch (e) { }

        Studio._tagEntityRecursive(obj, entityResult);
        return obj;
    }

    static registerPlugins() {
        Loader.registerPlugins();
        Components.registerSections();
    }

    static boot() {

        Status.element = jQuery('#status');
        WebGL.boot();
        Studio.registerPlugins();
        Keyboard.setup();
        Mouse.setup();

        Studio.createMenu();
        new Save();

        Layout.createDefaultLayout();

        WebGL.render();

        Status.hide();
        Status.showWelcome();

    }

    static createMenu() {

        Studio.menu = new Menu();

        /**
         * Save
         */
        let catSave = new Category({
            id: 'save',
            label: 'Save'
        });

        catSave.addType(new ActionType({
            id: 'save-all',
            label: 'Save Level',
            // enabled: false,
            callback: function (states) {

                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    Status.show("Prepare Files...");
                    Studio.menu.closeAll();

                    window.setTimeout(function () {
                        let game = Games.getGame(studioScene.mapEntry.gameId);
                        let level = studioScene.mapEntry.level;

                        let files = [];

                        files.push({ name: game.game === Games.GAMES.MANHUNT ? 'entity.inst' : 'entity_pc.inst', binary: Inst.build(game, level, false) });
                        files.push({ name: game.game === Games.GAMES.MANHUNT ? 'pak/modelspc.dff' : 'modelspc.mdl', binary: Dff.build(game, level) });
                        files.push({ name: game.game === Games.GAMES.MANHUNT ? 'pak/modelspc.txd' : 'modelspc.tex', binary: Txd.build(game, level) });
                        files.push({ name: game.game === Games.GAMES.MANHUNT ? 'entityTypeData.ini' : 'resource3.glg', binary: Glg.build(game, level) });
                        files.push({ name: game.game === Games.GAMES.MANHUNT ? 'collisions.col' : 'collisions_pc.col', binary: Col.build(game, level) });
                        // files.push({ name: game.game === Games.GAMES.MANHUNT ? 'mapAI.grf'      : 'mapai_pc.grf', binary: Grf.build(game, level)});

                        Save.outputZip(files);
                        Status.hide();
                    }, 100);

                }
            }
        }));

        let catExport = new Category({
            id: 'save-level',
            label: 'Level',
            callback: function (states) {
                catExport.clear();

                catExport.addType(new ActionType({
                    id: 'save-waypoint',
                    label: 'mapAI.grf (Waypoint)',
                    // enabled: false,
                    callback: function (states) {

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap) {
                            let game = Games.getGame(studioScene.mapEntry.gameId);
                            let level = studioScene.mapEntry.level;

                            let binary = Grf.build(game, level);
                            Save.output(binary, 'mapAI.grf');
                            Studio.menu.closeAll();
                        }

                    }
                }));

                catExport.addType(new ActionType({
                    id: 'save-entity',
                    label: 'entity.inst',
                    // enabled: false,
                    callback: function (states) {

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap) {
                            let game = Games.getGame(studioScene.mapEntry.gameId);
                            let level = studioScene.mapEntry.level;

                            let binary = Inst.build(game, level, false);
                            Save.output(binary, 'entity.inst');
                            Studio.menu.closeAll();
                        }
                    }
                }));

                catExport.addType(new ActionType({
                    id: 'save-modelmh1',
                    label: 'modelspc.dff',
                    // enabled: false,
                    callback: function (states) {

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap) {
                            let game = Games.getGame(studioScene.mapEntry.gameId);
                            let level = studioScene.mapEntry.level;

                            let binary = Dff.build(game, level);
                            Save.output(binary, 'modelspc.dff');
                            Studio.menu.closeAll();
                        }
                    }
                }));

                catExport.addType(new ActionType({
                    id: 'save-glg',
                    label: 'entityTypeData.ini',
                    // enabled: false,
                    callback: function (states) {

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap) {
                            let game = Games.getGame(studioScene.mapEntry.gameId);
                            let level = studioScene.mapEntry.level;

                            let binary = Glg.build(game, level);
                            Save.output(binary, game.game === Games.GAMES.MANHUNT ? 'entityTypeData.ini' : 'resource3.glg');
                            Studio.menu.closeAll();
                        }
                    }
                }));

                catExport.addType(new ActionType({
                    id: 'save-txd',
                    label: 'modelspc.txd',
                    // enabled: false,
                    callback: function (states) {

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap) {
                            let game = Games.getGame(studioScene.mapEntry.gameId);
                            let level = studioScene.mapEntry.level;

                            let binary = Txd.build(game, level);
                            Save.output(binary, game.game === Games.GAMES.MANHUNT ? 'modelspc.txd' : 'modelspc.mdl');
                            Studio.menu.closeAll();
                        }
                    }
                }));
                catExport.addType(new ActionType({
                    id: 'save-col',
                    label: 'collisions.col',
                    // enabled: false,
                    callback: function (states) {

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap) {
                            let game = Games.getGame(studioScene.mapEntry.gameId);
                            let level = studioScene.mapEntry.level;

                            let binary = Col.build(game, level);
                            Save.output(binary, game.game === Games.GAMES.MANHUNT ? 'collisions.col' : 'collisions_pc.col');
                            Studio.menu.closeAll();
                        }
                    }
                }));

                catExport.addType(new ActionType({
                    id: 'save-export',
                    label: 'export (testing)',
                    // enabled: false,
                    callback: function (states) {

                        let exporter = new OBJExporter();
                        const result = exporter.parse(StudioScene.getStudioSceneInfo().scene);

                        let blob = new Blob([result], { type: 'application/octet-stream' });

                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "export.obj";
                        link.click();
                        link.remove();

                        console.log(result);
                    }
                }));

            }

        });
        catSave.addSubCategory(catExport);

        Studio.menu.addCategory(catSave);

        /**
         * Edit
         */
        let catEdit = new Category({
            id: 'edit',
            label: 'Edit',
            enabled: true
        });

        catEdit.addType(new ActionType({
            id: 'edit-copy',
            label: 'Copy',
            enabled: true,
            callback: function (states) {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    Studio.menu.getById('edit-paste').enable();

                    /**
                     * @type {Walk}
                     */
                    let control = studioScene.sceneInfo.control;

                    let ogEntity = control.object.userData.entity;
                    if (ogEntity === undefined || ogEntity === null) {
                        console.error('no entity found on object', control.object);
                        return;
                    }

                    Studio.clipboard = {
                        level: studioScene.mapEntry.level,
                        entity: ogEntity
                    };

                } else if (studioScene instanceof SceneModel) {
                    alert("not supported right now, sry");
                }

                Studio.menu.closeAll();

            }
        }));

        catEdit.addType(new ActionType({
            id: 'edit-paste',
            label: 'Paste',
            enabled: false,
            callback: function () {
                let studioSceneInfo = StudioScene.getStudioSceneInfo();
                let studioScene = studioSceneInfo.studioScene;
                if (studioScene instanceof SceneMap) {

                    new Insert({
                        sceneInfo: studioScene.sceneInfo,
                        entityToCopy: Studio.clipboard.entity,
                        sourceLevel: Studio.clipboard.level,
                        sourceGame: Games.getGame(Studio.clipboard.entity.props.instance.gameId),
                        targetGame: Games.getGame(studioScene.mapEntry.gameId),
                        onPlaceCallback: function () {

                        }
                    });

                    /**
                     * @type {Walk}
                     */
                    let control = studioSceneInfo.control;
                    if (control.mode !== 'fly')
                        control.setMode('fly');

                    document.body.requestPointerLock();

                    Studio.menu.closeAll();
                }
            }
        }));

        // NEW: Placeholder model prompt + rebuild
        catEdit.addType(new ActionType({
            id: 'edit-placeholder-model',
            label: 'Set placeholder model (unmodeled entities)',
            enabled: true,
            callback: function () {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    studioScene.rebuildMissingEntityPlaceholders(true);
                }
                Studio.menu.closeAll();
            }
        }));

        catEdit.addType(new ActionType({
            id: 'edit-rebuild-placeholders',
            label: 'Rebuild placeholders',
            enabled: true,
            callback: function () {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    studioScene.rebuildMissingEntityPlaceholders(false);
                }
                Studio.menu.closeAll();
            }
        }));

        Studio.menu.addCategory(catEdit);

        /**
         * Waypoint
         */
        let catWaypoint = new Category({
            id: 'waypoint',
            label: 'Waypoint',
            enabled: false
        });

        catWaypoint.addType(new ActionType({
            id: 'waypoint-load-nodes',
            label: 'Load Waypoints',
            callback: function (states) {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {

                    studioScene.waypoints = new Waypoints(studioScene);

                    Studio.menu.getById('waypoint-load-nodes').disable();

                    Studio.menu.getById('waypoint-show-nodes').enable();
                    Studio.menu.getById('waypoint-show-relations').enable();
                    Studio.menu.getById('waypoint-show-routes').enable();
                    Studio.menu.getById('waypoint-show-nodes').triggerClick();
                    Studio.menu.getById('waypoint-show-relations').triggerClick();
                    Studio.menu.getById('waypoint-show-routes').triggerClick();
                    Studio.menu.getById('waypoint-routes').enable();
                    Studio.menu.getById('waypoint-areas').enable();
                    Studio.menu.getById('waypoint-clear').enable();

                }
            }
        }));

        catWaypoint.addType(new CheckboxType({
            id: 'waypoint-show-nodes',
            label: 'Show nodes',
            enabled: false,
            callback: function (states) {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    studioScene.waypoints.nodeVisible(states.active);

                    if (states.active) {
                        let relStates = Studio.menu.getStatesById('waypoint-show-relations');
                        if (relStates.active)
                            studioScene.waypoints.lineVisible(true);

                        let routesStates = Studio.menu.getStatesById('waypoint-show-routes');
                        if (routesStates.active)
                            studioScene.waypoints.routeVisible(true);
                    } else {
                        studioScene.waypoints.lineVisible(false);
                        studioScene.waypoints.routeVisible(false);
                    }
                }
            }
        }));

        catWaypoint.addType(new CheckboxType({
            id: 'waypoint-show-relations',
            label: 'Show relations',
            enabled: false,
            callback: function (states) {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    studioScene.waypoints.lineVisible(states.active);
                }
            }
        }));

        catWaypoint.addType(new CheckboxType({
            id: 'waypoint-show-routes',
            label: 'Show routes',
            enabled: false,
            callback: function (states) {
                let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                if (studioScene instanceof SceneMap) {
                    studioScene.waypoints.routeVisible(states.active);
                    studioScene.waypoints.routeHighlight(states.active);
                }
            }
        }));

        /**
         * Waypoint => Routes
         */
        let catWaypointRoutes = new Category({
            id: 'waypoint-routes',
            label: 'Routes',
            enabled: false,
            callback: function (states) {
                catWaypointRoutes.clear();

                let studioSceneInfo = StudioScene.getStudioSceneInfo();
                if (studioSceneInfo === null)
                    return;

                let studioScene = studioSceneInfo.studioScene;
                if (studioScene instanceof SceneMap) {

                    catWaypointRoutes.addType(new ActionType({
                        id: 'waypoint-route-create',
                        label: 'Create route',
                        callback: function (states) {

                            let name = prompt('New Route Name', '');
                            if (name === null || name === '')
                                return;

                            let showNodesType = Studio.menu.getById('waypoint-show-nodes');
                            if (showNodesType.states.active === false) {
                                showNodesType.triggerClick();
                            }

                            let showNodesRelType = Studio.menu.getById('waypoint-show-relations');
                            if (showNodesRelType.states.active === false) {
                                showNodesRelType.triggerClick();
                            }

                            let game = Games.getGame(studioScene.mapEntry.gameId);

                            /**
                             * @type {Walk}
                             */
                            let control = studioSceneInfo.control;
                            control.setMode('route-selection');

                            let route = new Route(name, null);
                            studioScene.sceneInfo.scene.add(route.getMesh());
                            route.setVisible(true);
                            route.highlight(true);

                            let routeData = {
                                name: name,
                                entries: [],
                                locations: []
                            };

                            let result = new Result(
                                Studio.WAYPOINT_ROUTE,
                                route.name,
                                "",
                                0,
                                routeData,
                                function () {
                                    return routeData;
                                }
                            );

                            result.level = studioScene.mapEntry.level;
                            route.entity = result;

                            game.addToStorage(result);
                            waypoints.routes.push(route);

                            waypoints.routeSelection(route);
                            Studio.menu.closeAll();
                        }
                    }));

                    let waypoints = studioScene.waypoints;
                    waypoints.routes.forEach(function (route) {

                        let catWaypointRouteEntry = new Category({
                            id: 'waypoint-route-' + route.name,
                            label: route.name,
                            callback: function (states) { }
                        });

                        catWaypointRouteEntry.addType(new ActionType({
                            id: 'waypoint-route-remove-' + route.name,
                            label: 'Remove',
                            callback: function (states) {

                                if (!confirm(`Delete route ${route.name}?`))
                                    return;

                                let game = Games.getGame(studioScene.mapEntry.gameId);

                                let entity = game.findOneBy({
                                    level: studioScene.mapEntry.level,
                                    type: Studio.WAYPOINT_ROUTE,
                                    name: route.name
                                });

                                game.removeFromStorage(entity);

                                route.setVisible(false);
                                route.highlight(false);

                                waypoints.routes.splice(waypoints.routes.indexOf(route), 1);

                                Studio.menu.closeAll();

                            }
                        }));

                        catWaypointRouteEntry.addType(new ActionType({
                            id: 'waypoint-route-route-' + route.name,
                            label: 'Edit',
                            callback: function (states) {
                                waypoints.routeVisible(false);
                                waypoints.routeHighlight(false);
                                route.setVisible(true);
                                route.highlight(true);

                                /**
                                 * @type {Walk}
                                 */
                                let control = studioSceneInfo.control;
                                control.setMode('route-selection');

                                waypoints.routeSelection(route);
                                Studio.menu.closeAll();

                            }
                        }));

                        catWaypointRouteEntry.addType(new ActionType({
                            id: 'waypoint-route-route-' + route.name,
                            label: 'Clear',
                            callback: function (states) {

                                route.highlight(false);
                                route.clear();
                                Studio.menu.closeAll();

                            }
                        }));

                        catWaypointRoutes.addSubCategory(catWaypointRouteEntry);

                    });
                }
            }
        });
        catWaypoint.addSubCategory(catWaypointRoutes);

        /**
         * Waypoint => Area
         */
        let catWaypointArea = new Category({
            id: 'waypoint-areas',
            label: 'Areas',
            enabled: false,
            callback: function (states) {
                if (states.open) {
                    catWaypointArea.clear();

                    let studioSceneInfo = StudioScene.getStudioSceneInfo();
                    if (studioSceneInfo === null)
                        return;

                    let studioScene = studioSceneInfo.studioScene;
                    if (studioScene instanceof SceneMap) {

                        let waypoints = studioScene.waypoints;

                        catWaypointArea.addType(new ActionType({
                            id: 'waypoint-stopper-create',
                            label: 'Create stopper',
                            callback: function (states) {
                                waypoints.placeStopper();

                                /**
                                 * @type {Walk}
                                 */
                                let control = studioSceneInfo.control;
                                if (control.mode !== 'fly')
                                    control.setMode('fly');

                                document.body.requestPointerLock();

                                Studio.menu.closeAll();
                            }
                        }));

                        catWaypointArea.addType(new ActionType({
                            id: 'waypoint-area-create',
                            label: 'Start new area',
                            callback: function (states) {

                                let name = prompt('New Area Name', 'area1');
                                if (name === null || name === '')
                                    return;

                                waypoints.placeNewNode(name);
                                document.body.requestPointerLock();

                                Studio.menu.closeAll();
                            }
                        }));

                        waypoints.children.forEach(function (area) {

                            let catWaypointAreaEntry = new Category({
                                id: 'waypoint-area-' + area.name,
                                label: area.name,
                                callback: function (states) { }
                            });

                            catWaypointAreaEntry.addType(new ActionType({
                                id: 'waypoint-area-node-' + area.name,
                                label: 'Add node',
                                callback: function (states) {

                                    let showNodesType = Studio.menu.getById('waypoint-show-nodes');
                                    if (showNodesType.states.active === false) {
                                        showNodesType.triggerClick();
                                    }

                                    requestAnimationFrame(function () {
                                        waypoints.placeNewNode(area.name);
                                        document.body.requestPointerLock();
                                    });

                                    Studio.menu.closeAll();
                                }
                            }));

                            catWaypointAreaEntry.addType(new ActionType({
                                id: `waypoint-area-${area.name}-gen`,
                                label: 'Generate Mesh',
                                callback: function (states) {

                                    let showNodesType = Studio.menu.getById('waypoint-show-nodes');
                                    if (showNodesType.states.active === false) {
                                        showNodesType.triggerClick();
                                    }

                                    /**
                                     * @type {Walk}
                                     */
                                    let control = studioSceneInfo.control;
                                    if (control.mode === "transform") {
                                        waypoints.nodeGenerate(area, control.object.position);
                                    } else {

                                        if (area.children.length > 0) {
                                            let node = area.children[0];
                                            waypoints.nodeGenerate(area, node.getMesh().position);
                                        }
                                    }

                                    Studio.menu.closeAll();
                                }
                            }));

                            catWaypointAreaEntry.addType(new ActionType({
                                id: `waypoint-area-${area.name}-clear`,
                                label: 'Clear',
                                callback: function (states) {

                                    let studioSceneInfo = StudioScene.getStudioSceneInfo();
                                    if (studioSceneInfo === null)
                                        return;

                                    let studioScene = studioSceneInfo.studioScene;
                                    if (studioScene instanceof SceneMap) {

                                        let waypoints = studioScene.waypoints;
                                        waypoints.clear(area.name);
                                        Studio.menu.closeAll();
                                    }
                                }
                            }));

                            catWaypointAreaEntry.addType(new ActionType({
                                id: `waypoint-area-${area.name}-remove`,
                                label: 'Remove',
                                callback: function (states) {

                                    let studioSceneInfo = StudioScene.getStudioSceneInfo();
                                    if (studioSceneInfo === null)
                                        return;

                                    let studioScene = studioSceneInfo.studioScene;
                                    if (studioScene instanceof SceneMap) {

                                        area.clear();
                                        waypoints.children.splice(waypoints.children.indexOf(area), 1);
                                    }

                                    Studio.menu.closeAll();

                                }
                            }));

                            catWaypointArea.addSubCategory(catWaypointAreaEntry);

                        });

                    }
                }
            }
        });

        catWaypoint.addSubCategory(catWaypointArea);
        catWaypoint.addType(new ActionType({
            id: 'waypoint-clear',
            label: 'Clear everything',
            enabled: false,
            callback: function (states) {

                if (!confirm('Clear all Areas and Routes?'))
                    return;

                let studioSceneInfo = StudioScene.getStudioSceneInfo();
                if (studioSceneInfo === null)
                    return;

                let studioScene = studioSceneInfo.studioScene;
                if (studioScene instanceof SceneMap) {

                    let waypoints = studioScene.waypoints;
                    waypoints.routes.forEach(function (route) {
                        route.clear();
                    });

                    waypoints.clear();
                }
            }
        }));

        Studio.menu.addCategory(catWaypoint);

    }

}
