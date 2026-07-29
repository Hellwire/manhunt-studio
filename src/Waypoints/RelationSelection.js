import Mouse from "../Mouse.js";
import {Raycaster, Vector2} from "../Vendor/three.module.js";
import WebGL from "../WebGL.js";
import Keyboard from "../Keyboard.js";

export default class RelationSelection{

    raycaster = new Raycaster();
    pointer = new Vector2(0, 0);
    meshes = [];
    isActive = true;
    isMouseRegistered = false;
    isKeyboardRegistered = false;

    constructor(props){
        this.sceneInfo = props.sceneInfo;
        this.waypoints = props.waypoints;
        this.source = props.source;
        this.action = props.action === "unlink" ? "unlink" : "link";
        this.onComplete = props.onComplete;

        this.mouseClick = this.onMouseClick.bind(this);
        this.keyUpEsc = this.onKeyUpEsc.bind(this);

        this.waypoints.children.forEach(area => {
            area.children.forEach(node => {
                this.meshes.push(node.getMesh().children[0]);
            });
        });

        Keyboard.onKeyUp('Escape', this.keyUpEsc);
        this.isKeyboardRegistered = true;

        setTimeout(() => {
            if (!this.isActive) return;
            Mouse.onMouseClick(this.mouseClick);
            this.isMouseRegistered = true;
        }, 500);
    }

    unbind(changed = false){
        if (!this.isActive) return;
        this.isActive = false;

        if (this.isMouseRegistered)
            Mouse.removeOnMouseClick(this.mouseClick);
        if (this.isKeyboardRegistered)
            Keyboard.removeOnKeyUp('Escape', this.keyUpEsc);

        if (typeof this.onComplete === "function")
            this.onComplete(changed);
    }

    restoreSourceSelection(){
        const control = this.sceneInfo.control;
        control.setObject(this.source.getMesh());
        control.setMode('transform');
        document.exitPointerLock();
    }

    onKeyUpEsc(){
        this.unbind(false);
        this.restoreSourceSelection();
    }

    onMouseClick(event){
        let domElement = WebGL.renderer.domElement;
        let rect = domElement.getBoundingClientRect();

        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.sceneInfo.camera);

        let intersects = this.raycaster.intersectObjects(this.meshes, true);
        for (let i = 0; i < intersects.length; i++){
            let target = this.waypoints.getNode(intersects[i].object);
            if (target === false || target === this.source)
                continue;

            let changed;
            if (this.action === "unlink")
                changed = this.waypoints.disconnectNodes(this.source, target, true);
            else
                changed = this.waypoints.connectNodes(this.source, target, true);

            this.unbind(changed);
            this.restoreSourceSelection();
            return;
        }
    }
}
