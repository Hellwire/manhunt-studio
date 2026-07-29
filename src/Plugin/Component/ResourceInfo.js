// src/Component/Resource/ResourceInfo.js
import AbstractComponent from "./Abstract.js";
import Studio from "../../Studio.js";
import Event from "../../Event.js";
import Storage from "../../Storage.js";
import Games from "../../Plugin/Games.js";
import StudioScene from "../../Scene/StudioScene.js";
import Result from "../Loader/Result.js";
import SceneMap from "../../Scene/SceneMap.js";
import {
    editorToFilePosition,
    editorToFileRotation,
    fileToEditorPosition
} from "../InstTransform.js";

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
     * @param entry {Result}
     * @param result {Array}
     */
    generateModelInfo(entry, result){
        // unchanged / unused in your snippet
    }

    // Editor (three) -> INST (file/game) mapping used by your Inst.build():
    // instX = editorX
    // instY = -editorZ
    // instZ = editorY
    static editorPosToInst(pos){
        return editorToFilePosition(pos);
    }

    static instToEditorPos(inst){
        return fileToEditorPosition(inst);
    }

    /**
     * @param entry {Result}
     */
    setEntry(entry){
        if (entry === undefined || entry === null) return;

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
                    postprocess: function ( element ) {
                        element.find('input').keyup(function (e) {
                            let attr = jQuery(e.target).attr('name');
                            let value = parseFloat(jQuery(e.target).val());
                            if (isNaN(value)) return;

                            if (attr === "x") entry.mesh.position.x = value;
                            if (attr === "y") entry.mesh.position.y = value;
                            if (attr === "z") entry.mesh.position.z = value;
                        });
                    }
                });

                result.push({
                    label: 'Node ID',
                    value: `<input value="${entry.props.id}" readonly title="MapAI links use this stable editor ID. IDs are remapped automatically on export." />`
                });

                result.push({
                    label: 'Node name',
                    value: `<input value="${entry.props.nodeName}" />`,
                    postprocess: function ( element ) {
                        element.find('input').keyup(function (e) {
                            entry.props.nodeName = jQuery(e.target).val();
                        });
                    }
                });

                result.push({
                    label: 'Radius',
                    value: `<input value="${entry.props.radius}" />`,
                    postprocess: function ( element ) {
                        element.find('input').keyup(function (e) {
                            let v = parseFloat(jQuery(e.target).val());
                            if (isNaN(v)) return;
                            entry.props.radius = v;
                        });
                    }
                });

                {
                    let studioSceneInfo = StudioScene.getStudioSceneInfo();
                    let studioScene = studioSceneInfo ? studioSceneInfo.studioScene : null;
                    let waypoints = studioScene instanceof SceneMap ? studioScene.waypoints : null;
                    let node = waypoints ? waypoints.getNode(entry) : false;

                    if (node !== false){
                        let area = waypoints.getAreaForNode(node);

                        result.push({
                            label: 'Area',
                            value: `<span>${area !== false ? area.name : entry.props.areaName}</span>`
                        });

                        result.push({
                            label: 'Create',
                            value: `<span>Create linked node</span>`,
                            onClick: function () {
                                let control = studioSceneInfo.control;
                                if (control.mode !== 'fly')
                                    control.setMode('fly');

                                waypoints.placeNewNode(
                                    area !== false ? area.name : entry.props.areaName,
                                    {anchorNode: node}
                                );
                                document.body.requestPointerLock();
                            }
                        });

                        const selectRelationTarget = function (action) {
                            let control = studioSceneInfo.control;
                            control.setMode('route-selection');
                            waypoints.relationSelection(node, action, function () {
                                _this.setEntry(entry);
                            });
                        };

                        result.push({
                            label: 'Paths',
                            value: `<span>Link another node...</span>`,
                            onClick: function () {
                                selectRelationTarget('link');
                            }
                        });

                        result.push({
                            label: 'Paths',
                            value: `<span>Unlink another node...</span>`,
                            onClick: function () {
                                selectRelationTarget('unlink');
                            }
                        });

                        let linkedNodes = [];
                        (entry.props.waypoints || []).forEach(function (waypoint) {
                            let linked = waypoints.nodeByNodeId[waypoint.linkId];
                            if (linked !== undefined && linkedNodes.indexOf(linked) === -1)
                                linkedNodes.push(linked);
                        });

                        linkedNodes.forEach(function (linkedNode) {
                            const displayName = linkedNode.entity.props.nodeName || linkedNode.name || `Node ${linkedNode.getId()}`;
                            result.push({
                                label: 'Linked to',
                                value: `<span>Unlink ${displayName} (#${linkedNode.getId()})</span>`,
                                onClick: function () {
                                    waypoints.disconnectNodes(node, linkedNode, true);
                                    _this.setEntry(entry);
                                }
                            });
                        });

                        if (linkedNodes.length > 0){
                            result.push({
                                label: 'Paths',
                                value: `<span>Unlink all (${linkedNodes.length})</span>`,
                                onClick: function () {
                                    if (!confirm(`Unlink node ${node.getId()} from every connected node?`))
                                        return;
                                    waypoints.disconnectAll(node);
                                    _this.setEntry(entry);
                                }
                            });
                        }
                    }
                }

                result.push({
                    label: '&nbsp;',
                    value: `<span>Remove</span>`,
                    onClick: function () {
                        if (!confirm(`Delete waypoint node ${entry.props.id}?`))
                            return;

                        let studioScene = StudioScene.getStudioSceneInfo().studioScene;
                        if (studioScene instanceof SceneMap){

                            studioScene.waypoints.removeNodeId(entry.props.id);

                            let control = StudioScene.getStudioSceneInfo().control;
                            control.keyStates.modeSelectObject = true;
                            control.setMode('select');
                            document.exitPointerLock();
                            _this.element.html('');
                        }
                    }
                });

                break;

            case Studio.ENTITY: {

                let game = Games.getGame(entry.gameId);

                let record = game.findOneBy({
                    type: Studio.GLG,
                    level: entry.level,
                    name: entry.props.instance.props.glgRecord
                });

                if (record && record.props && record.props.model !== false){
                    let model = game.findOneBy({
                        type: Studio.MODEL,
                        level: entry.level,
                        name: record.props.model
                    });

                    if (model){
                        normalizedModel = model.props.normalize();
                        object = normalizedModel.getObjects()[0];

                        result.push({
                            label: 'Model',
                            value: model.name
                        });
                    }
                }

                result.push({ label: 'Instance', value: entry.name });
                result.push({ label: 'Record', value: record ? record.name : "(missing glg)" });

                const sceneInfo = StudioScene.getStudioSceneInfo();
                const scene = sceneInfo ? sceneInfo.scene : null;

                object = scene ? scene.getObjectByName(entry.name) : null;

                if (!object){
                    result.push({
                        label: 'Warning',
                        value: `No scene object found for "${entry.name}" (cannot show/edit position).`
                    });
                    break;
                }

                // ✅ keep instance wired + data populated for export (no UI here)
                if (entry.props && entry.props.instance){
                    entry.props.instance.entity = entry.props.instance.entity || {};
                    if (!entry.props.instance.entity.mesh) entry.props.instance.entity.mesh = object;

                    const instDataRef = (typeof entry.props.instance.data === "function")
                        ? entry.props.instance.data()
                        : null;

                    if (instDataRef){
                        instDataRef.position = instDataRef.position || { x: 0, y: 0, z: 0 };
                        instDataRef.rotation = instDataRef.rotation || { x: 0, y: 0, z: 0, w: 1 };

                        // store EDITOR (three) coords; Inst.build converts to INST on write
                        instDataRef.position.x = object.position.x;
                        instDataRef.position.y = object.position.y;
                        instDataRef.position.z = object.position.z;

                        instDataRef.rotation.x = object.quaternion.x;
                        instDataRef.rotation.y = object.quaternion.y;
                        instDataRef.rotation.z = object.quaternion.z;
                        instDataRef.rotation.w = object.quaternion.w;
                    }
                }

                // --- show INST coordinates (file/game) in UI ---
                const instPos = ResourceInfo.editorPosToInst(object.position);

                result.push({
                    label: 'Position',
                    value: `
<span class="badge badge-secondary">x</span>:<input name="x" value="${instPos.x.toFixed(2)}" style="width: 40px;" /> 
<span class="badge badge-secondary">y</span>:<input name="y" value="${instPos.y.toFixed(2)}" style="width: 40px;" />
<span class="badge badge-secondary">z</span>:<input name="z" value="${instPos.z.toFixed(2)}" style="width: 40px;" />
`,
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
                            if (attr === "x") object.position.x = value;
                            if (attr === "y") object.position.z = -value;
                            if (attr === "z") object.position.y = value;

                            // keep instData.position synced (editor coords)
                            if (entry.props && entry.props.instance && typeof entry.props.instance.data === "function"){
                                const instDataRef = entry.props.instance.data();
                                if (instDataRef){
                                    instDataRef.position = instDataRef.position || { x: 0, y: 0, z: 0 };
                                    instDataRef.position.x = object.position.x;
                                    instDataRef.position.y = object.position.y;
                                    instDataRef.position.z = object.position.z;
                                }
                            }
                        });
                    }
                });

                const instRotation = editorToFileRotation(object.quaternion);
                result.push({
                    label: 'Rotation',
                    value: `<span class="badge badge-secondary">x</span>:${instRotation.x.toFixed(3)} <span class="badge badge-secondary">y</span>:${instRotation.y.toFixed(3)} <span class="badge badge-secondary">z</span>:${instRotation.z.toFixed(3)} <span class="badge badge-secondary">w</span>:${instRotation.w.toFixed(3)} `,
                    postprocess: function ( element ) {
                        element.find('span').click(function () {
                            const rotation = editorToFileRotation(object.quaternion);
                            navigator.clipboard.writeText(`{
    "x": ${rotation.x.toFixed(6)},
    "y": ${rotation.y.toFixed(6)},
    "z": ${rotation.z.toFixed(6)},
    "w": ${rotation.w.toFixed(6)}
}`);
                        });
                    }
                });

                // existing trigger radius display (kept)
                if (record && record.props && record.props.getValue('CLASS') === 'EC_TRIGGER'){
                    result.push({
                        label: 'Radius',
                        value: `${entry.props.instance.data().settings.radius}`
                    });
                }

                break;
            }

            case Studio.MODEL:

                normalizedModel = entry.props.normalize();
                object = normalizedModel.getObjects()[0];

                result.push({ label: '&nbsp;', value: entry.file });
                result.push({ label: 'Name', value: entry.name });
                result.push({ label: 'Skinned', value: object.skinning ? 'Yes' : 'No' });
                result.push({ label: 'Vertex Count', value: normalizedModel.data.vertexCount });

                materialInfo = jQuery('<ul>').addClass('material');
                object.material.forEach(function (name) {
                    (function (name) {
                        materialInfo.append(
                            jQuery('<li>').append(
                                jQuery('<span>').html(name).click(function () {
                                    let texture = Storage.findBy({
                                        type: Studio.TEXTURE,
                                        level: entry.level,
                                        gameId: entry.gameId,
                                        name: name
                                    })[0];

                                    Event.dispatch(Event.OPEN_ENTRY, { entry: texture });
                                })
                            )
                        );
                    })(name);
                });

                result.push({ label: 'Material', value: materialInfo });
                break;

            case Studio.TEXTURE: {
                let data = entry.data();
                result.push({ label: 'Dimensions', value: data.texture.width + 'x' + data.texture.height });
                break;
            }
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
