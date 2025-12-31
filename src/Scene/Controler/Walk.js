// src/Scene/Controler/Walk.js (FULL PATCHED FILE - BASIC UNDO for transforms only)

import {Capsule} from "../../Vendor/Capsule.js";
import {Group, Vector3, Raycaster, Vector2, TextureLoader, RepeatWrapping} from "../../Vendor/three.module.js";
import {TransformControls} from "../Controls/TransformControls.js";
import WebGL from "../../WebGL.js";
import {OrbitControls} from "../Controls/OrbitControls.js";
import StudioScene from "../StudioScene.js";
import Event from "../../Event.js";
import Status from "../../Status.js";
import {RenderPass} from "../../Vendor/RenderPass.js";
import {OutlinePass} from "../../Vendor/OutlinePass.js";
import Studio from "../../Studio.js";
import Config from "../../Config.js";

// ------------------------------
// Transform drag HUD (simple DOM)
// ------------------------------

function _fmt(n, d = 3) {
    if (!Number.isFinite(n)) return "0";
    return n.toFixed(d);
}
function _radToDeg(r) {
    return r * (180 / Math.PI);
}
function _editorPosToInst(pos) {
    // instX = editorX
    // instY = -editorZ
    // instZ = editorY
    return {
        x: pos.x,
        y: -pos.z,
        z: pos.y
    };
}

class TransformDragHUD {
    constructor() {
        let el = document.querySelector('[data-transform-hud="1"]');
        if (!el) {
            el = document.createElement("div");
            el.setAttribute("data-transform-hud", "1");
            el.style.position = "fixed";
            el.style.left = "12px";
            el.style.bottom = "12px";
            el.style.zIndex = "999999";
            el.style.padding = "8px 10px";
            el.style.background = "rgba(0,0,0,0.65)";
            el.style.color = "#fff";
            el.style.fontFamily = "monospace";
            el.style.fontSize = "12px";
            el.style.lineHeight = "1.35";
            el.style.pointerEvents = "none";
            el.style.whiteSpace = "pre";
            el.style.borderRadius = "4px";
            el.style.display = "none";
            document.body.appendChild(el);
        }

        this.el = el;
        this.active = false;

        this.startPos = null;
        this.startRot = null;
        this.startScale = null;
        this.lastObjectId = null;
    }

    show() { this.el.style.display = "block"; }
    hide() {
        this.el.style.display = "none";
        this.active = false;
        this.startPos = null;
        this.startRot = null;
        this.startScale = null;
        this.lastObjectId = null;
    }

    begin(transform) {
        if (!transform || !transform.object) return;

        const obj = transform.object;

        this.active = true;
        this.startPos = obj.position ? obj.position.clone() : null;
        this.startRot = obj.rotation ? obj.rotation.clone() : null;
        this.startScale = obj.scale ? obj.scale.clone() : null;

        this.lastObjectId = obj.uuid || obj.id || obj.name || null;

        this.show();
        this.update(transform);
    }

    update(transform) {
        if (!this.active || !transform || !transform.object) return;

        const obj = transform.object;

        const curId = obj.uuid || obj.id || obj.name || null;
        if (this.lastObjectId !== null && curId !== this.lastObjectId) {
            this.begin(transform);
            return;
        }

        const axis = transform.axis || "-";
        const mode = transform.mode || "-";
        const space = transform.space || "-";

        const p = obj.position || { x: 0, y: 0, z: 0 };
        const r = obj.rotation || { x: 0, y: 0, z: 0 };
        const s = obj.scale || { x: 1, y: 1, z: 1 };

        const inst = _editorPosToInst(p);

        let extra = "";

        if (this.startPos && mode === "translate") {
            const dp = {
                x: p.x - this.startPos.x,
                y: p.y - this.startPos.y,
                z: p.z - this.startPos.z
            };
            const instStart = _editorPosToInst(this.startPos);
            const dinst = {
                x: inst.x - instStart.x,
                y: inst.y - instStart.y,
                z: inst.z - instStart.z
            };

            extra =
                "Delta (translate)\n" +
                `  Editor dx ${_fmt(dp.x)}  dy ${_fmt(dp.y)}  dz ${_fmt(dp.z)}\n` +
                `  INST   dx ${_fmt(dinst.x)}  dy ${_fmt(dinst.y)}  dz ${_fmt(dinst.z)}\n`;
        } else if (this.startRot && mode === "rotate") {
            extra =
                "Delta (rotate deg)\n" +
                `  dx ${_fmt(_radToDeg(r.x - this.startRot.x), 2)}  dy ${_fmt(_radToDeg(r.y - this.startRot.y), 2)}  dz ${_fmt(_radToDeg(r.z - this.startRot.z), 2)}\n`;
        } else if (this.startScale && mode === "scale") {
            const fx = this.startScale.x ? (s.x / this.startScale.x) : 0;
            const fy = this.startScale.y ? (s.y / this.startScale.y) : 0;
            const fz = this.startScale.z ? (s.z / this.startScale.z) : 0;

            extra =
                "Factor (scale)\n" +
                `  fx ${_fmt(fx)}  fy ${_fmt(fy)}  fz ${_fmt(fz)}\n`;
        }

        const name = obj.name || "(unnamed)";

        this.el.textContent =
            `Transform drag\n` +
            `Object: ${name}\n` +
            `Mode: ${mode}   Space: ${space}   Axis: ${axis}\n` +
            `Editor Pos: ${_fmt(p.x)}  ${_fmt(p.y)}  ${_fmt(p.z)}\n` +
            `INST   Pos: ${_fmt(inst.x)}  ${_fmt(inst.y)}  ${_fmt(inst.z)}\n` +
            `Rot (deg):  ${_fmt(_radToDeg(r.x), 2)}  ${_fmt(_radToDeg(r.y), 2)}  ${_fmt(_radToDeg(r.z), 2)}\n` +
            `Scale:      ${_fmt(s.x)}  ${_fmt(s.y)}  ${_fmt(s.z)}\n` +
            extra;
    }
}

export default class Walk {

    mode = "fly";
    keyStates = {
        modeSelectObject: false,
        ShiftLeft: false
    };

    playerCollider = new Capsule(
        new Vector3(0, 0.35, 0),
        new Vector3(0, 1, 0),
        0.35
    );

    playerVelocity = new Vector3();
    playerDirection = new Vector3();

    // ------------------------------
    // BASIC UNDO (TRANSFORMS ONLY)
    // ------------------------------
    undoStack = [];
    undoMax = 50;
    _undoStart = null; // { name, state }
    // ------------------------------

    /**
     *
     * @param sceneInfo {StudioSceneInfo}
     */
    constructor(sceneInfo) {
        this.sceneInfo = sceneInfo;
        this.sceneInfo.camera.rotation.order = 'YXZ';

        if (Config.outlineActiveObject){
            const renderPass = new RenderPass( sceneInfo.scene, sceneInfo.camera );
            WebGL.composer.addPass( renderPass );
            WebGL.composer.addPass( WebGL.effectFXAA );

            let bbox = sceneInfo.element.parentNode.getBoundingClientRect();
            this.outlinePass = new OutlinePass( new Vector2( bbox.width, bbox.height ), sceneInfo.scene, sceneInfo.camera );
            WebGL.composer.addPass( this.outlinePass );
        }

        let _this = this;

        document.addEventListener('keydown', (event) => {
            _this.keyStates[event.code] = true;

            // BASIC UNDO: Ctrl+Z
            if (event.ctrlKey && (event.code === "KeyZ" || event.key === "z" || event.key === "Z")) {
                event.preventDefault();
                _this.undoLastTransform();
            }
        });

        document.addEventListener('keyup', (event) => {
            _this.keyStates[event.code] = false;

            if (event.code === 'KeyQ')
                this.transform.setSpace( this.transform.space === 'local' ? 'world' : 'local' );
            if (event.code === 'KeyW')
                this.transform.setMode( 'translate' );
            if (event.code === 'KeyE')
                this.transform.setMode( 'rotate' );
            if (event.code === 'KeyR')
                this.transform.setMode( 'scale' );

            if (event.code === 'Escape') {
                if (this.mode === "route-selection"){
                    this.setMode("fly");
                    document.exitPointerLock();
                }
            }

            if (event.code === 'KeyI') {
                _this.keyStates.modeSelectObject = !_this.keyStates.modeSelectObject;
                if (_this.keyStates.modeSelectObject)
                    _this.setMode("select");
                else
                    _this.setMode("fly");
            }
            if (event.code === 'KeyO') {
                // console.log("cilds",sceneInfo.scene);
            }
        });

        WebGL.renderer.domElement.addEventListener('mousedown', () => {
            if (this.mode === "fly")
                document.body.requestPointerLock();
        });

        document.body.addEventListener('mousemove', (event) => {
            if ( (document.pointerLockElement === document.body && _this.mode === "fly" || _this.mode === "select") || _this.mode === "route-selection" ) {
                sceneInfo.camera.rotation.y -= event.movementX / 500;
                sceneInfo.camera.rotation.x -= event.movementY / 500;
            }
        });

        WebGL.renderer.domElement.addEventListener('click', function (event) {
            if (_this.keyStates.modeSelectObject && _this.mode === "select")
                _this.doRayCast(event);
        }, true);

        this.orbit = new OrbitControls(sceneInfo.camera, WebGL.renderer.domElement);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.05;
        this.orbit.screenSpacePanning = false;
        this.orbit.minDistance = 0.5;
        this.orbit.maxDistance = 15.0;
        this.orbit.maxPolarAngle = Math.PI / 2;
        this.orbit.target.set(0, 0, 0);
        this.orbit.enabled = false;

        this.transform = new TransformControls(sceneInfo.camera, WebGL.renderer.domElement);
        this.transform.traverse((obj) => { // To be detected correctly by OutlinePass.
            obj.isTransformControls = true;
        });

        // HUD for dragging info
        this._dragHud = new TransformDragHUD();

        this.transform.addEventListener('dragging-changed', function (event) {
            _this.orbit.enabled = !event.value;

            // HUD
            if (event.value === true) {
                if (_this.mode === "transform") _this._dragHud.begin(_this.transform);
            } else {
                _this._dragHud.hide();
            }

            // UNDO: capture "before" at drag start
            if (event.value === true) {
                _this._beginUndoCapture();
            }
        });

        // Live updates while dragging
        this.transform.addEventListener('objectChange', function () {
            if (_this.mode === "transform") _this._dragHud.update(_this.transform);
        });

        // Finalize transform on release + push undo item
        this.transform.addEventListener('mouseUp', function (event) {
            _this._dragHud.update(_this.transform);
            _this.onObjectChanged(event);
            _this._dragHud.hide();

            // UNDO: push "before/after" as one step
            _this._endUndoCaptureAndPush();
        });

        sceneInfo.scene.add(this.transform);

        this.setMode('fly');
    }

    // ------------------------------
    // BASIC UNDO IMPLEMENTATION
    // ------------------------------

    _captureState(obj){
        return {
            position: obj.position.clone(),
            quaternion: obj.quaternion.clone(),
            scale: obj.scale.clone()
        };
    }

    _sameState(a, b){
        const eps = 1e-6;
        const eq = (x,y) => Math.abs(x - y) <= eps;

        return (
            eq(a.position.x, b.position.x) &&
            eq(a.position.y, b.position.y) &&
            eq(a.position.z, b.position.z) &&

            eq(a.quaternion.x, b.quaternion.x) &&
            eq(a.quaternion.y, b.quaternion.y) &&
            eq(a.quaternion.z, b.quaternion.z) &&
            eq(a.quaternion.w, b.quaternion.w) &&

            eq(a.scale.x, b.scale.x) &&
            eq(a.scale.y, b.scale.y) &&
            eq(a.scale.z, b.scale.z)
        );
    }

    _applyState(obj, state){
        obj.position.copy(state.position);
        obj.quaternion.copy(state.quaternion);
        obj.scale.copy(state.scale);
        obj.updateMatrixWorld(true);

        // keep INST in sync even if object isn't currently selected
        const ent = obj?.userData?.entity;
        if (ent && ent.props && ent.props.instance && typeof ent.props.instance.data === "function"){
            const inst = ent.props.instance.data();
            inst.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
            inst.rotation = { x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w };
        }
    }

    _beginUndoCapture(){
        if (!this.object) return;
        if (!this.object.name) return;

        this._undoStart = {
            name: this.object.name,
            state: this._captureState(this.object)
        };
    }

    _endUndoCaptureAndPush(){
        if (!this._undoStart) return;
        if (!this.object) { this._undoStart = null; return; }
        if (this.object.name !== this._undoStart.name) { this._undoStart = null; return; }

        const after = this._captureState(this.object);
        const before = this._undoStart.state;

        this._undoStart = null;

        if (this._sameState(before, after)) return;

        this.undoStack.push({
            name: this.object.name,
            before: before,
            after: after
        });

        if (this.undoStack.length > this.undoMax) {
            this.undoStack.shift();
        }
    }

    undoLastTransform(){
        if (!this.undoStack.length) return;

        const step = this.undoStack.pop();
        const obj = this.sceneInfo?.scene ? this.sceneInfo.scene.getObjectByName(step.name) : null;
        if (!obj) return;

        this._applyState(obj, step.before);

        // if this is the currently selected object, refresh orbit target and UI sync
        if (this.object && this.object.name === step.name) {
            this.orbit.target.copy(obj.position);
            this.onObjectChanged();
        }
    }

    // ------------------------------

    onObjectChanged(){

        if (!this.object || !this.object.userData || this.object.userData.entity === undefined)
            return;

        if (this.object.userData.entity.props.instance !== undefined){
            let inst = this.object.userData.entity.props.instance.data();

            inst.position = {
                x: this.object.position.x,
                y: this.object.position.y,
                z: this.object.position.z,
            };

            inst.rotation = {
                x: this.object.quaternion.x,
                y: this.object.quaternion.y,
                z: this.object.quaternion.z,
                w: this.object.quaternion.w
            };
        }

        this.orbit.target.copy(this.object.position);
    }

    doRayCast(event) {

        let studioSceneInfo = StudioScene.getStudioSceneInfo(undefined);
        let camera = studioSceneInfo.camera;
        let domElement = WebGL.renderer.domElement;
        let scene = studioSceneInfo.scene;

        let _raycaster = new Raycaster();
        _raycaster.layers.enableAll();
        let _mouse = new Vector2();

        let rect = domElement.getBoundingClientRect();

        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        _raycaster.setFromCamera(_mouse, camera);

        //we want only game object, no helpers
        let childs = [];
        scene.children.forEach(function (child) {
            if (child.type === "Group" )
                childs.push(child);
        });

        let intersects = _raycaster.intersectObjects(childs, true);

        let clickedGroups = [];
        intersects.forEach(function (obj) {
            let parent = obj.object.parent;

            if (parent === null || parent.type !== "Group" || parent.name === "scene")
                return;
            clickedGroups.push(parent);
        });

        if (clickedGroups.length > 0) {

            if (Config.outlineActiveObject)
                this.outlinePass.selectedObjects = [clickedGroups[0].children[0]];

            this.setObject(clickedGroups[0]);
            this.setMode('transform');
            this.sceneInfo.lookAt = clickedGroups[0].userData.entity;
        }
    }

    getForwardVector() {

        this.sceneInfo.camera.getWorldDirection(this.playerDirection);
        this.playerDirection.y = 0;
        this.playerDirection.normalize();

        return this.playerDirection;
    }

    getSideVector() {
        this.sceneInfo.camera.getWorldDirection(this.playerDirection);
        this.playerDirection.y = 0;

        this.playerDirection.normalize();
        this.playerDirection.cross(this.sceneInfo.camera.up);

        return this.playerDirection;
    }

    flyControls(deltaTime) {

        const speed = 25 + (this.keyStates['ShiftLeft'] ? 75 : 0);

        if (this.keyStates['KeyW'])
            this.playerVelocity.add(this.getForwardVector().multiplyScalar(speed * deltaTime));

        if (this.keyStates['KeyS'])
            this.playerVelocity.add(this.getForwardVector().multiplyScalar(-speed * deltaTime));

        if (this.keyStates['KeyA'])
            this.playerVelocity.add(this.getSideVector().multiplyScalar(-speed * deltaTime));

        if (this.keyStates['KeyD'])
            this.playerVelocity.add(this.getSideVector().multiplyScalar(speed * deltaTime));

        if (this.keyStates['KeyQ'])
            this.playerVelocity.y = 7;

        if (this.keyStates['KeyE'])
            this.playerVelocity.y = -7;
    }

    setObject(object) {
        this.object = object;

        this.sceneInfo.camera.lookAt(object.position);
        this.orbit.target.copy(object.position);

        this.transform.detach();
        this.transform.attach(object);

        Studio.menu.getById('edit-copy').enable();

        if (object.userData.entity !== undefined)
            Event.dispatch(Event.VIEW_ENTRY, { entry: object.userData.entity });
    }

    update(delta) {

        if ((this.mode === "fly" && document.pointerLockElement === document.body) || this.mode === "route-selection" ) {
            this.flyControls(delta);

            const damping = Math.exp(-3 * delta) - 1;
            this.playerVelocity.addScaledVector(this.playerVelocity, damping);

            const deltaPosition = this.playerVelocity.clone().multiplyScalar(delta);
            this.playerCollider.translate(deltaPosition);

            this.sceneInfo.camera.position.copy(this.playerCollider.end);

        } else if (this.mode === "transform") {
            this.orbit.update(delta);

            if (this._dragHud && this._dragHud.active) {
                this._dragHud.update(this.transform);
            }
        }
    }

    highlightModelsInRange(range){
        let studioSceneInfo = StudioScene.getStudioSceneInfo();

        let scene = studioSceneInfo.scene;

        let _this = this;
        scene.children.forEach(
            function (child) {
                let dist = child.position.distanceTo(_this.playerCollider.end);
                if (dist <= range){

                    child.children[0].material.forEach(function (material) {
                        material.wireframe = true;
                        material.needsUpdate = true;
                    });
                }
            }
        );
    }

    setMode(mode) {

        if (this.mode === "transform" && mode !== "transform") {
            Studio.menu.getById('edit-copy').disable();
            this.transform.detach();
            this.orbit.enabled = false;

            if (this._dragHud) this._dragHud.hide();

            if (mode === "fly"){
                this.playerCollider.end.copy( this.orbit.object.position );
            }

            document.body.requestPointerLock();
        } else if (this.mode === "fly" &&  mode !== "fly") {
            document.exitPointerLock();
        }

        if (mode === "fly") {

            if (Config.outlineActiveObject)
                this.outlinePass.selectedObjects = [];

        } else if (mode === "transform") {
            this.orbit.enabled = true;
            this.keyStates.modeSelectObject = true;
        }

        if (mode === "fly"){
            Status.showInfo('world');
        }else if (mode === "select"){
            Status.showInfo('select');
        }else if (mode === "transform"){
            Status.showInfo('transform');
        }else if (mode === "route-selection"){
            Status.showInfo('route-selection');
        }

        this.mode = mode;
    }
}
