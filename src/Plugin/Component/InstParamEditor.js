// src/Component/Config/InstParamEditor.js
import UIError from "../../Menu/UIError.js";
import InstLoader from "../../Plugin/Loader/Game/ManhuntGeneric/Inst.js";

export default class InstParamEditor {

    // UI toggles
    static allowAdd = false; // you said you don't need add
    static allowRemove = true;

    static _cssInstalled = false;

    // label(lower) -> internal int32 hash (little-endian value that gets written with setInt32)
    static _reverseMap = null;

    // -----------------------
    // Endian helpers (MH2)
    // -----------------------

    static _swapU32(u){
        u = (u >>> 0);
        return (
            ((u & 0x000000FF) << 24) |
            ((u & 0x0000FF00) << 8)  |
            ((u & 0x00FF0000) >>> 8) |
            ((u & 0xFF000000) >>> 24)
        ) >>> 0;
    }

    // internal int32 (little-endian numeric) -> file-order hex string (what you see in JSON/files)
    static _hashI32ToFileHex(i32){
        const le = (i32 >>> 0);
        const fileU32 = InstParamEditor._swapU32(le);
        return fileU32.toString(16).padStart(8, "0");
    }

    // file-order hex string -> internal int32 (little-endian numeric)
    static _fileHexToHashI32(hex8){
        const fileU32 = (parseInt(hex8, 16) >>> 0);
        const leU32 = InstParamEditor._swapU32(fileU32);
        return (leU32 | 0);
    }

    static _labelFromFileHex(hex8){
        try {
            const map = InstLoader?.map || {};
            const key = "m_" + String(hex8).toLowerCase();
            return (map[key] !== undefined) ? String(map[key]) : null;
        } catch (_) {
            return null;
        }
    }

    // -----------------------
    // CSS
    // -----------------------

    static _installCssOnce(){
        if (InstParamEditor._cssInstalled) return;
        InstParamEditor._cssInstalled = true;

        const style = document.createElement("style");
        style.type = "text/css";
        style.textContent = `
            .inst-param-editor{
                width: 100%;
                padding: 6px 0;
                overflow: hidden; /* avoid horizontal clipping of toolbar */
                position: relative;
                left: 0;
            }

            .inst-param-toolbar{
                display:flex;
                gap:8px;
                align-items:flex-start;
                flex-wrap:wrap;
                margin: 0 0 8px 0;
            }

            .inst-param-toolbar button{
                padding: 2px 6px;
                font-size: 11px;
                line-height: 1.2;
                cursor: pointer;
            }

            .inst-param-hint{
                flex: 1 1 100%;
                font-size: 11px;
                opacity: 0.85;
                line-height: 1.25;
                white-space: normal;
                overflow-wrap: anywhere;
            }

            /* rows wrap instead of forcing a wide grid */
            .inst-param-grid{
                min-width: 0;
            }

            .inst-param-row{
                display:flex;
                flex-wrap:wrap;
                gap:6px;
                align-items:flex-end;
                padding: 6px 0;
                border-bottom: 1px solid rgba(255,255,255,0.08);
            }

            .inst-param-row.header{
                padding-top: 0;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255,255,255,0.15);
                opacity: 0.9;
            }

            .inst-param-col{
                display:flex;
                flex-direction:column;
                gap:3px;
                min-width: 0;
            }

            .inst-param-col label{
                font-size: 10px;
                opacity: 0.8;
                user-select: none;
            }

            .inst-param-col input,
            .inst-param-col select{
                box-sizing: border-box;
                height: 22px;
                padding: 2px 4px;
                font-size: 11px;
                width: 100%;
                max-width: 100%;
            }

            /* responsive column sizing for narrow config panel */
            .inst-param-col.id    { flex: 1 1 96px;  max-width: 120px; }
            .inst-param-col.name  { flex: 1 1 96px;  min-width: 80px;  }
            .inst-param-col.type  { flex: 0 0 56px; }
            .inst-param-col.value { flex: 1 1 78px;  max-width: 110px; }

            .inst-param-idlabel{
                font-size: 10px;
                opacity: 0.75;
                line-height: 1.1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .inst-param-actions{
                display:flex;
                gap:6px;
                align-items:flex-end;
                margin-left: auto;
            }

            .inst-param-actions button{
                height: 22px;
                padding: 0 6px;
                font-size: 11px;
                line-height: 1;
                cursor: pointer;
            }

            .inst-param-invalid{ outline: 2px solid rgba(255,0,0,0.65); }
            .inst-param-warn{ outline: 2px solid rgba(255,165,0,0.60); }
        `;
        document.head.appendChild(style);
    }

    // -----------------------
    // Parsing / mapping
    // -----------------------

    static _parseHashInput(text){
        if (text === undefined || text === null) return null;
        const t = String(text).trim();
        if (!t) return null;

        // accept "m_bcd42800" (file-order)
        if (/^m_[0-9a-fA-F]{8}$/.test(t)){
            const hex = t.slice(2);
            return InstParamEditor._fileHexToHashI32(hex);
        }

        // accept "0xbcd42800" (file-order)
        if (/^0x[0-9a-fA-F]+$/.test(t)){
            const hex = t.slice(2).padStart(8, "0").slice(-8);
            return InstParamEditor._fileHexToHashI32(hex);
        }

        // accept "bcd42800" (file-order)
        if (/^[0-9a-fA-F]{8}$/.test(t)){
            return InstParamEditor._fileHexToHashI32(t);
        }

        // accept decimal int32 (internal value)
        if (/^-?\d+$/.test(t)){
            return (parseInt(t, 10) | 0);
        }

        return null;
    }

    static _getReverseMap(){
        if (InstParamEditor._reverseMap) return InstParamEditor._reverseMap;

        const reverse = {};
        try {
            const map = InstLoader?.map || {};
            Object.keys(map).forEach((k) => {
                const label = String(map[k] ?? "").trim();
                if (!label) return;

                let hex = String(k);
                if (hex.startsWith("m_")) hex = hex.slice(2);
                if (!/^[0-9a-fA-F]{8}$/.test(hex)) return;

                // map keys are file-order -> convert to internal int32 hash
                const h = InstParamEditor._fileHexToHashI32(hex);
                reverse[label.toLowerCase()] = h;
            });
        } catch (_) {}

        InstParamEditor._reverseMap = reverse;
        return reverse;
    }

    static _resolveHashFromUserInput(text){
        const parsed = InstParamEditor._parseHashInput(text);
        if (parsed !== null) return parsed;

        const key = String(text ?? "").trim().toLowerCase();
        if (!key) return null;

        const reverse = InstParamEditor._getReverseMap();
        if (reverse[key] !== undefined) return reverse[key];

        return null;
    }

    static _coerceValueByType(type, raw){
        if (type === "str") return String(raw ?? "");

        if (type === "flo"){
            const f = parseFloat(raw);
            return isNaN(f) ? null : f;
        }

        const i = parseInt(raw, 10);
        return isNaN(i) ? null : i;
    }

    static _normalizeSetting(s, isMH2, idx){
        if (!s || typeof s !== "object") s = {};

        if (s.value === undefined && s.val !== undefined) s.value = s.val;
        if (s.type === undefined && s.kind !== undefined) s.type = s.kind;

        if (s.parameterId === undefined){
            if (isMH2 && s.hash !== undefined && s.hash !== false){
                s.parameterId = InstParamEditor._hashI32ToFileHex(s.hash);
            } else if (s.name !== undefined) {
                s.parameterId = s.name;
            } else {
                s.parameterId = "";
            }
        }

        if (!s.name || !String(s.name).trim()){
            s.name = `unk_${idx}`;
        }

        const allowed = [ "int", "boo", "flo", "str" ];
        if (!s.type || allowed.indexOf(s.type) === -1) s.type = "int";

        if (s.value === undefined){
            s.value = (s.type === "str") ? "" : 0;
        }

        if (isMH2){
            if (s.hash === undefined) s.hash = false;

            if (s.hash === false){
                const tryText = s.parameterId || s.name;
                const h = InstParamEditor._resolveHashFromUserInput(tryText);
                if (h !== null) s.hash = h;
            }

            // if we have a hash, keep parameterId normalized to file-order hex
            if (s.hash !== false && s.hash !== undefined && s.hash !== null){
                s.parameterId = InstParamEditor._hashI32ToFileHex(s.hash);
            }

            // auto-fill name from map if it is still unk_#
            if (/^unk_\d+$/.test(String(s.name))){
                const hex8 = (s.hash !== false) ? InstParamEditor._hashI32ToFileHex(s.hash) : null;
                const label = hex8 ? InstParamEditor._labelFromFileHex(hex8) : null;
                if (label) s.name = label;
            }
        }

        return s;
    }

    /**
     * Mutates instData.settings (and aliases instData.parameters).
     * @param instData {object}
     * @param isMH2 {boolean}
     * @returns {jQuery}
     */
    static build(instData, isMH2){
        InstParamEditor._installCssOnce();

        let settings = instData?.settings;
        if (!Array.isArray(settings)) settings = instData?.parameters;
        if (!Array.isArray(settings)) settings = [];

        instData.settings = settings;
        instData.parameters = settings;

        const root = jQuery('<div class="inst-param-editor">');

        // toolbar (NOT inside a horizontally scrolling container)
        const toolbar = jQuery('<div class="inst-param-toolbar">');

        if (InstParamEditor.allowAdd){
            const btnAdd = jQuery('<button type="button">Add</button>');
            btnAdd.on("click", () => {
                settings.push({
                    parameterId: isMH2 ? "00000000" : "",
                    name: "NEW_PARAM",
                    hash: isMH2 ? (0 | 0) : false,
                    type: "int",
                    value: 0
                });
                render();
            });
            toolbar.append(btnAdd);
        }

        const hint = jQuery('<div class="inst-param-hint"></div>');
        hint.text(isMH2
            ? 'MH2: Id is file-order. Use 8-hex / 0x... / m_... / known label.'
            : 'MH1: settings are sequential fields (no hashes).'
        );

        toolbar.append(hint);
        root.append(toolbar);

        const grid = jQuery('<div class="inst-param-grid">');

        // header
        const header = jQuery('<div class="inst-param-row header">');
        if (isMH2) header.append(jQuery('<div class="inst-param-col id"><label>Id</label></div>'));
        header.append(jQuery('<div class="inst-param-col name"><label>Name</label></div>'));
        header.append(jQuery('<div class="inst-param-col type"><label>Type</label></div>'));
        header.append(jQuery('<div class="inst-param-col value"><label>Value</label></div>'));
        header.append(jQuery('<div class="inst-param-actions"><label>&nbsp;</label></div>'));
        grid.append(header);

        const render = () => {
            grid.find(".inst-param-row").not(".header").remove();

            settings.forEach((s, idx) => {
                s = InstParamEditor._normalizeSetting(s, isMH2, idx);
                settings[idx] = s;

                const row = jQuery('<div class="inst-param-row">');

                // Id (MH2)
                let idInput = null;
                let idLabel = null;

                if (isMH2){
                    const colId = jQuery('<div class="inst-param-col id">');
                    idInput = jQuery('<input type="text">').val(s.parameterId || "");
                    idLabel = jQuery('<div class="inst-param-idlabel"></div>');

                    const refreshIdLabel = () => {
                        if (s.hash === false || s.hash === undefined || s.hash === null){
                            idLabel.text("");
                            idLabel.removeAttr("title");
                            return;
                        }
                        const hex8 = InstParamEditor._hashI32ToFileHex(s.hash);
                        const label = InstParamEditor._labelFromFileHex(hex8);
                        const show = label ? label : "";
                        idLabel.text(show);
                        if (show) idLabel.attr("title", show);
                        else idLabel.removeAttr("title");
                    };

                    const validateId = (toast) => {
                        const raw = String(idInput.val() ?? "").trim();
                        s.parameterId = raw;

                        const h = InstParamEditor._resolveHashFromUserInput(raw);
                        if (h === null){
                            idInput.addClass("inst-param-invalid");
                            if (toast) UIError.report(new Error(`Invalid parameter id: "${raw}"`), "INST parameter editor");
                            return;
                        }

                        idInput.removeClass("inst-param-invalid");

                        // store internal hash
                        s.hash = h;

                        // normalize display to file-order hex
                        const hex8 = InstParamEditor._hashI32ToFileHex(s.hash);
                        s.parameterId = hex8;
                        idInput.val(hex8);

                        // auto-fill name from map if still unk_#
                        const label = InstParamEditor._labelFromFileHex(hex8);
                        if (label && /^unk_\d+$/.test(String(s.name))){
                            s.name = label;
                            nameInput.val(label);
                        }

                        refreshIdLabel();
                    };

                    idInput.on("keyup", () => validateId(false));
                    idInput.on("change", () => validateId(true));

                    colId.append(idInput).append(idLabel);
                    row.append(colId);

                    refreshIdLabel();
                }

                // Name
                const colName = jQuery('<div class="inst-param-col name">');
                const nameInput = jQuery('<input type="text">').val(s.name ?? "");
                colName.append(nameInput);
                row.append(colName);

                nameInput.on("keyup change", () => {
                    s.name = String(nameInput.val() ?? "");

                    if (isMH2 && (s.hash === false || s.hash === undefined)){
                        const h = InstParamEditor._resolveHashFromUserInput(s.name);
                        if (h !== null){
                            s.hash = h;

                            const hex8 = InstParamEditor._hashI32ToFileHex(s.hash);
                            s.parameterId = hex8;

                            if (idInput){
                                idInput.val(hex8).removeClass("inst-param-invalid");
                            }
                            if (idLabel){
                                const label = InstParamEditor._labelFromFileHex(hex8);
                                idLabel.text(label ? label : "");
                                if (label) idLabel.attr("title", label);
                            }
                        }
                    }
                });

                // Type
                const colType = jQuery('<div class="inst-param-col type">');
                const typeSel = jQuery('<select>');
                [ "int", "boo", "flo", "str" ].forEach((t) => typeSel.append(jQuery('<option>').attr("value", t).text(t)));
                typeSel.val(s.type);
                colType.append(typeSel);
                row.append(colType);

                // Value
                const colVal = jQuery('<div class="inst-param-col value">');
                const valueInput = jQuery('<input type="text">').val(s.value);
                colVal.append(valueInput);
                row.append(colVal);

                const applyValue = () => {
                    const raw = valueInput.val();
                    const coerced = InstParamEditor._coerceValueByType(s.type, raw);
                    if (coerced === null){
                        valueInput.addClass("inst-param-invalid");
                        return;
                    }

                    valueInput.removeClass("inst-param-invalid");
                    valueInput.removeClass("inst-param-warn");

                    s.value = coerced;

                    if (s.type === "boo"){
                        s.value = s.value ? 1 : 0;
                        valueInput.val(s.value);
                    }
                };

                valueInput.on("keyup change", applyValue);

                typeSel.on("change", () => {
                    s.type = String(typeSel.val() ?? "int");

                    const coerced = InstParamEditor._coerceValueByType(s.type, s.value);
                    if (coerced !== null){
                        s.value = coerced;
                        valueInput.val(s.value).removeClass("inst-param-invalid").removeClass("inst-param-warn");
                    }else{
                        valueInput.addClass("inst-param-warn");
                    }

                    applyValue();
                });

                // Actions
                const actions = jQuery('<div class="inst-param-actions">');

                if (InstParamEditor.allowRemove){
                    const btnRemove = jQuery('<button type="button" title="Remove parameter">X</button>');
                    btnRemove.on("click", () => {
                        const i = settings.indexOf(s);
                        if (i !== -1) settings.splice(i, 1);
                        render();
                    });
                    actions.append(btnRemove);
                }

                row.append(actions);
                grid.append(row);

                // ensure value formatting is valid on first render
                applyValue();
            });
        };

        render();
        root.append(grid);
        return root;
    }
}
