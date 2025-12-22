import {OrbitControls} from "./../Controls/OrbitControls.js";
import {TransformControls} from "./../Controls/TransformControls.js";
import WebGL from "./../../WebGL.js";

function _fmt(n, d = 3) {
    if (!Number.isFinite(n)) return "0";
    return n.toFixed(d);
}
function _radToDeg(r) {
    return r * (180 / Math.PI);
}

class TransformDragHUD {
    constructor() {
        this.el = document.createElement("div");
        this.el.style.position = "fixed";
        this.el.style.left = "12px";
        this.el.style.bottom = "12px";
        this.el.style.zIndex = "999999";
        this.el.style.padding = "8px 10px";
        this.el.style.background = "rgba(0,0,0,0.65)";
        this.el.style.color = "#fff";
        this.el.style.fontFamily = "monospace";
        this.el.style.fontSize = "12px";
        this.el.style.lineHeight = "1.35";
        this.el.style.pointerEvents = "none";
        this.el.style.whiteSpace = "pre";
        this.el.style.borderRadius = "4px";
        this.el.style.display = "none";
        document.body.appendChild(this.el);

        this.active = false;
        this.startPos = null;
        this.startRot = null;
        this.startScale = null;
        this.lastAxis = null;
    }

    dispose() {
        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        this.el = null;
    }

    show() {
        if (this.el) this.el.style.display = "block";
    }

    hide() {
        if (this.el) this.el.style.display = "none";
        this.active = false;
        this.startPos = null;
        this.startRot = null;
        this.startScale = null;
        this.lastAxis = null;
    }

    begin(transform) {
        if (!transform || !transform.object) return;

        this.active = true;
        this.lastAxis = transform.axis;

        this.startPos = transform.object.position.clone();
        this.startRot = transform.object.rotation.clone(); // Euler in radians
        this.startScale = transform.object.scale.clone();

        this.show();
        this.update(transform);
    }

    update(transform) {
        if (!this.active || !transform || !transform.object || !this.el) return;

        const obj = transform.object;

        const name = obj.name || "(unnamed)";
        const axis = transform.axis || "-";
        const mode = transform.mode || "-";
        const space = transform.space || "-";

        const p = obj.position;
        const r = obj.rotation;
        const s = obj.scale;

        let extra = "";

        if (this.startPos && mode === "translate") {
            const dx = p.x - this.startPos.x;
            const dy = p.y - this.startPos.y;
            const dz = p.z - this.startPos.z;
            extra =
                "Delta (pos)\n" +
                `  dx ${_fmt(dx)}  dy ${_fmt(dy)}  dz ${_fmt(dz)}\n`;
        } else if (this.startRot && mode === "rotate") {
            // Simple euler delta (good enough for HUD; avoids heavy quaternion math)
            let drx = _radToDeg(r.x - this.startRot.x);
            let dry = _radToDeg(r.y - this.startRot.y);
            let drz = _radToDeg(r.z - this.startRot.z);
            extra =
                "Delta (rot deg)\n" +
                `  dx ${_fmt(drx, 2)}  dy ${_fmt(dry, 2)}  dz ${_fmt(drz, 2)}\n`;
        } else if (this.startScale && mode === "scale") {
            const sx = this.startScale.x !== 0 ? (s.x / this.startScale.x) : 0;
            const sy = this.startScale.y !== 0 ? (s.y / this.startScale.y) : 0;
            const sz = this.startScale.z !== 0 ? (s.z / this.startScale.z) : 0;
            extra =
                "Factor (scale)\n" +
                `  fx ${_fmt(sx)}  fy ${_fmt(sy)}  fz ${_fmt(sz)}\n`;
        }

        const rotDegX = _radToDeg(r.x);
        const rotDegY = _radToDeg(r.y);
        const rotDegZ = _radToDeg(r.z);

        // Optional: show entity name if present
        let entityLine = "";
        try {
            const ent = obj.userData && obj.userData.entity ? obj.userData.entity : null;
            if (ent && ent.name) entityLine = `Entity: ${ent.name}\n`;
        } catch (e) {}

        this.el.textContent =
            `Transform drag\n` +
            entityLine +
            `Object: ${name}\n` +
            `Mode: ${mode}   Space: ${space}   Axis: ${axis}\n` +
            `Pos:   ${_fmt(p.x)}  ${_fmt(p.y)}  ${_fmt(p.z)}\n` +
            `Rot:   ${_fmt(rotDegX, 2)}  ${_fmt(rotDegY, 2)}  ${_fmt(rotDegZ, 2)} (deg)\n` +
            `Scale: ${_fmt(s.x)}  ${_fmt(s.y)}  ${_fmt(s.z)}\n` +
            extra;
    }
}

export default class OrbitAndTransform{

    /**
     *
     * @param sceneInfo {StudioSceneInfo}
     */
    constructor(sceneInfo) {

        this.orbit = new OrbitControls( sceneInfo.camera, WebGL.renderer.domElement );
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.05;
        this.orbit.screenSpacePanning = false;
        this.orbit.minDistance = 0.5 ;
        this.orbit.maxPolarAngle = Math.PI / 2;
        this.orbit.target.set(0,0,0);
        this.orbit.enabled = true;

        this._dragHud = new TransformDragHUD();

        let _this = this;
        this.transform = new TransformControls( sceneInfo.camera, WebGL.renderer.domElement );

        this.transform.addEventListener( 'dragging-changed', function ( event ) {
            _this.orbit.enabled = ! event.value;

            // If dragging ended, hide HUD (safety)
            if (!event.value) _this._dragHud.hide();
        } );

        // Show HUD when user starts dragging an axis/plane
        this.transform.addEventListener("mouseDown", function () {
            // Only start HUD if an axis is actually selected
            if (_this.transform.axis !== null) {
                _this._dragHud.begin(_this.transform);
            }
        });

        // Update HUD during dragging
        this.transform.addEventListener("objectChange", function () {
            _this._dragHud.update(_this.transform);
        });

        // Hide HUD on mouse up
        this.transform.addEventListener("mouseUp", function () {
            _this._dragHud.hide();
        });

        sceneInfo.scene.add( this.transform );
    }

    update( ){
        this.orbit.update();
    }

    // Optional: call this if you ever destroy the control when switching scenes
    dispose(){
        try { if (this._dragHud) this._dragHud.dispose(); } catch (e) {}
    }
}
