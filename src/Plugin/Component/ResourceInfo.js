import AbstractComponent from "./Abstract.js";
import Studio from "../../Studio.js";
import Event from "../../Event.js";
import Storage from "../../Storage.js";
import Games from "../../Plugin/Games.js";
import StudioScene from "../../Scene/StudioScene.js";
import Result from "../Loader/Result.js";
import SceneMap from "../../Scene/SceneMap.js";

export default class ResourceInfo extends AbstractComponent{

    name = "info";
    displayName = "Resource Info";

    /**
     * @param props {{}}
     */
    constructor(props) {
        super(props);

    }

    /**
     *
     * @param entry {Result}
     */
    generateModelInfo(entry, result){

    }

    // Editor (three) -> INST (file/game) mapping used by your Inst.build():
    // instX = editorX
    // instY = -editorZ
    // instZ = editorY
    static editorPosToInst(pos){
        return {
            x: pos.x,
            y: -pos.z,
            z: pos.y
        };
    }

    static instToEditorPos(inst){
        return {
            x: inst.x,
            y: inst.z,
            z: -inst.y
        };
    }

    /**
     * @param entry {Result}
     */
    setEntry(entry){
        if (entry === undefined)
            return;

        if (entry === null)
            return;

        let result = [];
        let object;
        let materialInfo;
        let normalizedModel;
        let _this = this;

        switch (entry.type) {

            case Studio.AREA_LOCATION:

                result.push({
                    label: 'Position',
                    value: `
<span class="badge badge-secondary">x</span>:<input name="x" value="${entry.mesh.position.x.toFixed(2)}" style="width: 40px;" /> 
<span class="badge badge-secondary">y</span>:<input name="y" value="${entry.mesh.position.y.toFixed(2)}" style="width: 40px;" />
<span class="badge badge-secondary">z</span>:<input name="z" value="${entry.mesh.position.z.toFixed(2)}" style="width: 40px;" />
`,
                    /**
                     * @param element {jQuery}
                     */
                    postprocess: function ( element ) {

                        element.find('input').keyup(function (e) {

                            let attr = jQuery(e.target).attr('name');
                            let value = parseFloat(jQuery(e.target).val());
                            if (isNaN(value)) return;

                            if (attr === "x")
                                entry.mesh.position.x = value;
                            if (attr === "y")
                                entry.mesh.position.y = value;
                            if (attr === "z")
                                entry.mesh.position.z = value;

                        });

                    }
                });

                result.push({
                    label: 'Node Id',
                    value: `<input value="${entry.props.id}" />`,
                    /**
                     * @param element {jQuery}
                     */
                    postprocess: function ( element ) {
                        element.find('input').keyup(function (e) {
                            entry.props.id = jQuery(e.target).val();
                        });

                    }
                });


                result.push({
                    label: 'Node name',
                    value: `<input value="${entry.props.nodeName}" />`,
                    /**
                     * @param element {jQuery}
                     */
                    postprocess: function ( element ) {
                        element.find('input').keyup(function (e) {
                            entry.props.nodeName = jQuery(e.target).val();
                        });

                    }
                });


                result.push({
                    label: 'Radius',
                    value: `<input value="${entry.props.radius}" />`,
                    /**
                     * @param element {jQuery}
                     */
                    postprocess: function ( element ) {
                        element.find('input').keyup(function (e) {
                            let v = parseFloat(jQuery(e.target).val());
                            if (isNaN(v)) return;
                            entry.props.radius = v;
                        });

                    }
                });


                result.push({
                    label: '&nbsp;',
                    value: `<span>Remove</span>`,
                    onClick: function (  ) {
                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap){

                            if (entry.props.waypoints.length === 0){
                                alert("BUG: Unable to remove node without waypoint waypoint relations");
                                return;
                            }

                            /**
                             * @type {Node}
                             */
                            studioScene.waypoints.removeNodeId(entry.props.id);

                            /**
                             * @type {Walk}
                             */
                            let control = StudioScene.getStudioSceneInfo().control;
                            control.keyStates.modeSelectObject = true;
                            control.setMode('select');
                            document.exitPointerLock();
                            _this.element.html('');
                        }

                    }
                });

                break;

            case Studio.ENTITY:

                let game = Games.getGame(entry.gameId);

                let record = game.findOneBy({
                    type: Studio.GLG,
                    level: entry.level,
                    name: entry.props.instance.props.glgRecord
                });

                if (record.props.model !== false){
                    let model = game.findOneBy({
                        type: Studio.MODEL,
                        level: entry.level,
                        name: record.props.model
                    });

                    /**
                     * @type {NormalizeModel}
                     */
                    normalizedModel = model.props.normalize();

                    object = normalizedModel.getObjects()[0];

                    result.push({
                        label: 'Model',
                        value: model.name
                    });
                }

                result.push({
                    label: 'Instance',
                    value: entry.name
                });

                result.push({
                    label: 'Record',
                    value: record.name
                });

                object = StudioScene.getStudioSceneInfo().scene.getObjectByName(entry.name);

                // --- FIX: display INST coordinates (file/game), not editor (three) coordinates ---
                const instPos = ResourceInfo.editorPosToInst(object.position);

                result.push({
                    label: 'Position',
                    value: `
<span class="badge badge-secondary">x</span>:<input name="x" value="${instPos.x.toFixed(2)}" style="width: 40px;" /> 
<span class="badge badge-secondary">y</span>:<input name="y" value="${instPos.y.toFixed(2)}" style="width: 40px;" />
<span class="badge badge-secondary">z</span>:<input name="z" value="${instPos.z.toFixed(2)}" style="width: 40px;" />
`,
                    /**
                     * @param element {jQuery}
                     */
                    postprocess: function ( element ) {

                        // copy as INST coords
                        element.find('span').click(function () {
                            const p = ResourceInfo.editorPosToInst(object.position);
                            navigator.clipboard.writeText(`{
    "x": ${p.x.toFixed(2)},
    "y": ${p.y.toFixed(2)},
    "z": ${p.z.toFixed(2)}
}`);
                        });

                        element.find('input').keyup(function (e) {

                            let attr = jQuery(e.target).attr('name');
                            let value = parseFloat(jQuery(e.target).val());
                            if (isNaN(value)) return;

                            // Apply UI (INST) back to editor coords:
                            // editorX = instX
                            // editorY = instZ
                            // editorZ = -instY
                            if (attr === "x")
                                object.position.x = value;
                            if (attr === "y")
                                object.position.z = -value;
                            if (attr === "z")
                                object.position.y = value;

                        });

                    }
                });

                result.push({
                    label: 'Rotation',
                    value: `<span class="badge badge-secondary">x</span>:${object.rotation.x.toFixed(2)} <span class="badge badge-secondary">y</span>:${object.rotation.y.toFixed(2)} <span class="badge badge-secondary">z</span>:${object.rotation.z.toFixed(2)} `,
                    postprocess: function ( element ) {
                        element.find('span').click(function () {

                            navigator.clipboard.writeText(`{
    "x": ${object.quaternion.x.toFixed(2)},
    "y": ${(object.quaternion.z).toFixed(2)},
    "z": ${(object.quaternion.y * -1).toFixed(2)},
    "w": ${object.quaternion.w.toFixed(2)}
}`);
                        });
                    }
                });

                switch (record.props.getValue('CLASS')) {
                    case 'EC_TRIGGER':
                        result.push({
                            label: 'Radius',
                            value: `${entry.props.instance.data().settings.radius}`
                        });
                        break;
                }
                break;

            case Studio.MODEL:

                /**
                 * @type {NormalizeModel}
                 */
                normalizedModel = entry.props.normalize();

                object = normalizedModel.getObjects()[0];

                result.push({
                    label: '&nbsp;',
                    value: entry.file
                });

                result.push({
                    label: 'Name',
                    value: entry.name
                });

                result.push({
                    label: 'Skinned',
                    value: object.skinning ? 'Yes' : 'No'
                });

                result.push({
                    label: 'Vertex Count',
                    value: normalizedModel.data.vertexCount
                });

                materialInfo = jQuery('<ul>').addClass('material');
                object.material.forEach(function (name) {
                    (function (name) {

                        materialInfo.append(jQuery('<li>').append(jQuery('<span>').html(name).click(function () {

                            let texture = Storage.findBy({
                                type: Studio.TEXTURE,
                                level: entry.level,
                                gameId: entry.gameId,
                                name: name
                            })[0];

                            Event.dispatch(Event.OPEN_ENTRY, { entry: texture });

                        })));
                    })(name);
                });

                result.push({
                    label: 'Material',
                    value: materialInfo
                });

                break;

            case Studio.TEXTURE:
                /**
                 * @type {NormalizedTexture}
                 */
                let data = entry.data();

                result.push({
                    label: 'Dimensions',
                    value: data.texture.width + 'x' + data.texture.height
                });

                break;

        }

        let container = jQuery('<ul>');
        result.forEach(function (info) {
            let li = jQuery('<li>');
            li.append(jQuery('<span>').append(info.label));
            li.append(jQuery('<div>').append(info.value));
            if (info.onClick !== undefined)
                li.click(info.onClick);

            if (info.postprocess !== undefined)
                info.postprocess(li);

            container.append(li);
        });

        this.element.html('').append(container);
    }

}
