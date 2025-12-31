// src/Plugin/Component/GlgEditor.js
import AbstractComponent from "./Abstract.js";
import Studio from "../../Studio.js";
import Storage from "../../Storage.js";
import Event from "../../Event.js";
import Games from "../Games.js";

import UIError from "../../Menu/UIError.js";
import InstParamEditor from "./InstParamEditor.js";

export default class GlgEditorComponent extends AbstractComponent{

    name = "glgeditor";
    displayName = "Config";

    constructor(props) {
        super(props);
    }

    _renderList(rows){
        const container = jQuery('<ul>');
        rows.forEach((info) => {
            const li = jQuery('<li>');
            li.append(jQuery('<span>').append(info.label));
            li.append(jQuery('<div>').append(info.value));

            if (info.onClick) li.on('click', info.onClick);
            if (info.postprocess) info.postprocess(li);

            container.append(li);
        });
        this.element.html('').append(container);
    }

    _renderModel(entry){
        const record = Storage.findOneBy({
            type: Studio.GLG,
            level: entry.level,
            gameId: entry.gameId,
            props: { model: entry.name }
        });

        if (record === null){
            this.element.html('');
            return;
        }

        const rows = [];

        rows.push({ label: '&nbsp;', value: record.file.split("#")[1] });
        rows.push({ label: 'Name', value: record.name });
        rows.push({ label: 'Class', value: record.props.getValue('CLASS') });

        const head = record.props.getValue('HEAD');
        if (head !== false){
            rows.push({
                label: 'Head',
                value: jQuery('<span>').html(head).click(function () {
                    const headModel = Storage.findOneBy({
                        type: Studio.MODEL,
                        level: entry.level,
                        gameId: entry.gameId,
                        name: head
                    });
                    Event.dispatch(Event.OPEN_ENTRY, { entry: headModel });
                })
            });
        }

        const physics = record.props.getValue('PHYSICS');
        if (physics !== false){
            rows.push({ label: 'Physics', value: physics });
        }

        this._renderList(rows);
    }

    _renderInstParamsFromEntity(entry){
        const instResult = entry?.props?.instance;

        if (!instResult || typeof instResult.data !== "function"){
            this._renderList([
                { label: 'Config', value: 'No INST instance linked (entry.props.instance missing).' }
            ]);
            return;
        }

        const instData = instResult.data();
        const game = (() => { try { return Games.getGame(entry.gameId); } catch (_) { return null; } })();

        const isMH2 =
            (instResult.gameFourCC === Games.GAMES.MANHUNT_2) ||
            (game && game.game === Games.GAMES.MANHUNT_2);

        const rows = [];

        rows.push({ label: 'Instance', value: entry.name });
        rows.push({ label: 'Record', value: instData.glgRecord || instResult.props?.glgRecord || '(unknown)' });
        if (instData.entityClass) rows.push({ label: 'Class', value: instData.entityClass });

        // ✅ Parameters editor lives in this Config panel
        rows.push({
            label: 'Parameters',
            value: InstParamEditor.build(instData, isMH2)
        });

        this._renderList(rows);
    }

    _renderInstDirect(entry){
        // If you ever VIEW_ENTRY an INST Result directly
        const instData = (typeof entry.data === "function") ? entry.data() : null;
        if (!instData){
            this._renderList([{ label: 'Config', value: 'INST data() missing.' }]);
            return;
        }

        const game = (() => { try { return Games.getGame(entry.gameId); } catch (_) { return null; } })();
        const isMH2 =
            (entry.gameFourCC === Games.GAMES.MANHUNT_2) ||
            (game && game.game === Games.GAMES.MANHUNT_2);

        this._renderList([
            { label: 'Internal', value: instData.name || entry.name || '(unknown)' },
            { label: 'Record', value: instData.glgRecord || entry.props?.glgRecord || '(unknown)' },
            { label: 'Class', value: instData.entityClass || '(unknown)' },
            { label: 'Parameters', value: InstParamEditor.build(instData, isMH2) }
        ]);
    }

    /**
     * @param entry {Result|null}
     */
    setEntry(entry){
        try {
            if (!entry){
                this.element.html('');
                return;
            }

            if (entry.type === Studio.MODEL){
                this._renderModel(entry);
                return;
            }

            if (entry.type === Studio.ENTITY){
                this._renderInstParamsFromEntity(entry);
                return;
            }

            if (entry.type === Studio.INST){
                this._renderInstDirect(entry);
                return;
            }

            this.element.html('');
        } catch (e) {
            UIError.report(e, 'Config panel');
            this.element.html('');
        }
    }
}
