// SceneMap.js (FULL PATCHED FILE - placeholder support + correct placeholder positioning)

import {
    Geometry,
    Line,
    LineBasicMaterial,
    BoxGeometry,
    Mesh,
    MeshBasicMaterial,
    Vector3,
    SpotLight,
    GridHelper,
    PerspectiveCamera,
    HemisphereLight
} from "../Vendor/three.module.js";

import StudioScene from "./StudioScene.js";
import SceneAbstract from "./Abstract.js";
import Studio from "../Studio.js";
import Walk from "./Controler/Walk.js";
import Event from "../Event.js";
import Status from "../Status.js";
import Games from "../Plugin/Games.js";
import Waypoints from "../Waypoints.js";

export default class SceneMap extends SceneAbstract {

    /**
     *
     * @type {StudioSceneInfo}
     */
    sceneInfo = null;

    /**
     * @type {Result}
     */
    mapEntry;

    /**
     * @type {Waypoints}
     */
    waypoints;

    /**
     * @param entry {Result}
     * @param canvas {jQuery}
     * @param mapComponent {Map}
     */
    constructor(entry, canvas, mapComponent) {
        super(entry.level, canvas);

        let _this = this;
        this.mapEntry = entry;
        this.mapComponent = mapComponent;
        this.entitiesToProcess = [];
        this.entitiesProcess = 0;

        // entities that returned no mesh (no model) will be handled later
        this.missingEntities = [];

        Event.on(Event.MAP_ENTITIES_LOADED, function (props) {
            if (_this.mapEntry !== props.entry) return;
            _this.#setup();
        });

        this.sceneInfo = StudioScene.createSceneInfo(
            canvas,
            this.name,
            new PerspectiveCamera(Studio.FOV, 1.33, 0.1, 1000),
            Walk,
            function () { },
            this
        );
    }

    // Apply instance transform to any created mesh (fixes placeholders at 0,0,0)
    _applyEntityTransformToMesh(entity, mesh) {
        if (!entity || !mesh) return;

        const inst = entity?.props?.instance;
        const instData = (inst && typeof inst.data === "function") ? inst.data() : null;
        if (!instData) return;

        if (instData.position) {
            mesh.position.set(instData.position.x, instData.position.y, instData.position.z);
        }

        if (instData.rotation && instData.rotation.w !== undefined) {
            mesh.quaternion.set(
                instData.rotation.x,
                instData.rotation.y,
                instData.rotation.z,
                instData.rotation.w
            );
        }

        mesh.updateMatrixWorld(true);
    }

    applyPendingPlaceholders(forcePrompt) {
        if (!this.missingEntities || this.missingEntities.length === 0) return;

        // Ask once after import (or when forced)
        Studio.ensurePlaceholderModelSelection(this, forcePrompt === true);

        // Spawn placeholders for every entity that had no mesh
        while (this.missingEntities.length > 0) {
            let entity = this.missingEntities.shift();

            let ph = Studio.createPlaceholderMeshForEntity(this, entity);
            if (ph !== false && ph !== null) {

                // apply entity transform so placeholder spawns at correct location
                this._applyEntityTransformToMesh(entity, ph);

                ph.name = entity.name;
                ph.userData = ph.userData || {};
                ph.userData.entity = entity;

                entity.mesh = ph;
                this.sceneInfo.scene.add(ph);
                this.entitiesProcess++;
            }
        }
    }

    rebuildMissingEntityPlaceholders(forcePrompt) {
        // Remove all existing placeholders in the scene
        let toRemove = [];
        this.sceneInfo.scene.traverse((o) => {
            if (o && o.userData && o.userData.isPlaceholder === true) {
                toRemove.push(o);
            }
        });

        toRemove.forEach((o) => {
            if (o.parent) o.parent.remove(o);
        });

        // Rebuild based on which ENTITY entries are missing scene objects
        let game = Games.getGame(this.mapEntry.gameId);

        let allEntities = [];
        try {
            allEntities = game.findBy({ type: Studio.ENTITY, level: this.mapEntry.level }) || [];
        } catch (e) {
            allEntities = [];
        }

        this.missingEntities = [];

        allEntities.forEach((ent) => {
            const existing = this.sceneInfo.scene.getObjectByName(ent.name);
            if (!existing) {
                this.missingEntities.push(ent);
            }
        });

        this.applyPendingPlaceholders(forcePrompt === true);
    }

    loadNearByEntities() {
        let len = this.entitiesToProcess.length;
        if (len === 0) {

            this.applyPendingPlaceholders(true);

            StudioScene.changeScene(this.mapComponent.studioScene.name);
            Status.hide();
            return false;
        }

        let processEntries = 15;
        for (let i = 0; i < processEntries; i++) {
            let entity = this.entitiesToProcess.shift();
            if (!entity) break;

            let mesh = false;
            try {
                mesh = entity.data().getMesh();
            } catch (e) {
                mesh = false;
            }

            if (mesh !== false && mesh !== null) {

                // ensure mesh uses the instance transform
                this._applyEntityTransformToMesh(entity, mesh);

                mesh.name = entity.name;
                mesh.userData = mesh.userData || {};
                mesh.userData.entity = entity;
                entity.mesh = mesh;

                this.sceneInfo.scene.add(mesh);
                this.entitiesProcess++;

            } else {
                if (Studio.hasPlaceholderModelSelection(this)) {
                    let ph = Studio.createPlaceholderMeshForEntity(this, entity);
                    if (ph !== false && ph !== null) {

                        this._applyEntityTransformToMesh(entity, ph);

                        ph.name = entity.name;
                        ph.userData = ph.userData || {};
                        ph.userData.entity = entity;

                        entity.mesh = ph;
                        this.sceneInfo.scene.add(ph);
                        this.entitiesProcess++;
                    }
                } else {
                    this.missingEntities.push(entity);
                }
            }

            if (len - i - 1 === 0) {

                this.applyPendingPlaceholders(true);

                Studio.menu.getById('waypoint').enable();
                Studio.menu.getById('edit').enable();

                StudioScene.changeScene(this.mapComponent.studioScene.name);
                Status.hide();
                return;
            }
        }

        let _this = this;
        requestAnimationFrame(function () {
            _this.loadNearByEntities();
        });
    }

    #setup() {
        let game = Games.getGame(this.mapEntry.gameId);
        this.entitiesToProcess = game.findBy({
            type: Studio.ENTITY,
            level: this.mapEntry.level
        });

        this.loadNearByEntities();
    }

    /**
     *
     * @param map {Group}
     */
    display(map) {
        this.sceneInfo.scene.add(map);
    }
}
