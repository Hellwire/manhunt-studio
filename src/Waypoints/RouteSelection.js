import Mouse from "../Mouse.js";
import {Raycaster, Vector2} from "../Vendor/three.module.js";
import WebGL from "../WebGL.js";
import Keyboard from "../Keyboard.js";

export default class RouteSelection{

    /**
     * @type {Waypoints}
     */
    waypoints = null;

    /**
     * @type {Raycaster}
     */
    raycaster = new Raycaster();

    pointer = new Vector2(0, 0);

    binding = {
        mouseClick: null,
        keyUpEsc: null
    };

    /**
     *
     * @type {function|null}
     */
    onPlaceCallback = null;

    /**
     *
     * @type {StudioSceneInfo|null}
     */
    sceneInfo = null;


    /**
     *
     * @type {Group[]}
     */
    meshes = [];

    /**
     *
     * @type {Route}
     */
    route = null;
    isActive = true;
    isMouseRegistered = false;
    isKeyboardRegistered = false;


    /**
     *
     * @param props {{waypoints: Waypoints, route: Route, sceneInfo: StudioSceneInfo,  onPlaceCallback: function}}
     */
    constructor(props){
        this.route = props.route;
        this.sceneInfo = props.sceneInfo;
        this.waypoints = props.waypoints;
        this.onPlaceCallback = props.onPlaceCallback;

        this.binding.mouseClick = this.onMouseClick.bind(this);
        this.binding.keyUpEsc = this.onKeyUpEsc.bind(this);

        let _this = this;
        this.waypoints.children.forEach(function (area) {
            area.children.forEach(function (node) {
                _this.meshes.push(node.getMesh().children[0]);

            });
        });

        Keyboard.onKeyUp('Escape', this.binding.keyUpEsc);
        this.isKeyboardRegistered = true;

        /**
         * We need to delay the registration a little bit
         * Otherwise we receive the Click-Event from the Menu-Interaction
         */
        setTimeout(function () {
            if (!_this.isActive) return;
            Mouse.onMouseClick(_this.binding.mouseClick);
            _this.isMouseRegistered = true;
        }, 500);
    }


    unbind(){
        if (!this.isActive) return;
        this.isActive = false;

        if (this.isMouseRegistered)
            Mouse.removeOnMouseClick(this.binding.mouseClick);
        if (this.isKeyboardRegistered)
            Keyboard.removeOnKeyUp('Escape', this.binding.keyUpEsc);

        if (typeof this.onPlaceCallback === "function")
            this.onPlaceCallback(this.route);
    }


    onKeyUpEsc(){
        this.unbind();
    }

    onMouseClick(event){
        let domElement = WebGL.renderer.domElement;
        let rect = domElement.getBoundingClientRect();

        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.sceneInfo.camera);

        let intersects = this.raycaster.intersectObjects(this.meshes, true);

        for (let i = 0; i < intersects.length; i++){
            let node = this.waypoints.getNode(intersects[i].object);
            if (node === false)
                continue;

            if (this.route.hasNode(node))
                this.route.removeNode(node);
            else
                this.route.addNode(node);
            return;
        }
    }
}
