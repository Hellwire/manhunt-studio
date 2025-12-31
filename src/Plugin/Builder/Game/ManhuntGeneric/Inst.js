// src/Plugin/Builder/Game/ManhuntGeneric/Inst.js
import AbstractBuilder from "./../../Abstract.js";
import NBinary from "../../../../NBinary.js";
import Studio from "../../../../Studio.js";
import Games from "../../../../Plugin/Games.js";
import StudioScene from "../../../../Scene/StudioScene.js";

export default class Inst extends AbstractBuilder{
    static name = "Waypoints (Manhunt 1/2)";

    static _swap32u(u){
        u = (u >>> 0);
        return (
            ((u & 0x000000FF) << 24) |
            ((u & 0x0000FF00) << 8)  |
            ((u & 0x00FF0000) >>> 8) |
            ((u & 0xFF000000) >>> 24)
        ) >>> 0;
    }

    static _basename(file){
        let f = String(file ?? "");
        f = f.replace(/\\/g, "/");
        f = f.split("#")[0];
        const parts = f.split("/");
        return parts[parts.length - 1] || f;
    }

    static _pickInstEntries(game, level, preferredFile, fallbackFiles){
        const all = game.findBy({
            level: level,
            type: Studio.INST
        }) || [];

        // group by basename
        const groups = {};
        all.forEach((e) => {
            const b = Inst._basename(e.file);
            if (!groups[b]) groups[b] = [];
            groups[b].push(e);
        });

        const candidates = [preferredFile].concat(fallbackFiles || []);

        // 1) exact candidate match
        for (let i = 0; i < candidates.length; i++){
            const c = candidates[i];
            if (groups[c] && groups[c].length){
                return { entries: groups[c], picked: c, available: Object.keys(groups) };
            }
        }

        // 2) if there is only ONE inst file in this level, use it (better than exporting 0)
        const available = Object.keys(groups);
        if (available.length === 1){
            const only = available[0];
            return { entries: groups[only], picked: only, available };
        }

        // 3) none found
        return { entries: [], picked: null, available };
    }

    // Accept: internal number OR file-hex string ("775a62a7", "m_775a62a7", "0x775a62a7")
    static _hashToI32(hashOrId){
        if (hashOrId === false || hashOrId === undefined || hashOrId === null) return null;

        if (typeof hashOrId === "number"){
            return (hashOrId | 0);
        }

        const t0 = String(hashOrId).trim();
        if (!t0) return null;

        let t = t0;
        if (t.startsWith("m_")) t = t.slice(2);
        if (t.startsWith("0x") || t.startsWith("0X")) t = t.slice(2);

        if (/^[0-9a-fA-F]{8}$/.test(t)){
            const fileU = (parseInt(t, 16) >>> 0);
            const internalU = Inst._swap32u(fileU);
            return (internalU | 0);
        }

        if (/^-?\d+$/.test(t)){
            return (parseInt(t, 10) | 0);
        }

        return null;
    }

    static _resolveTransform(instEntry, instData){
        const mesh = instEntry?.entity?.mesh;
        let position = mesh?.position ?? instData?.position;
        let rotation = mesh?.quaternion ?? instData?.rotation;

        if (!position || !rotation){
            const name = instData?.name ?? instData?.internalName ?? instEntry?.name;
            try {
                const info = (typeof StudioScene?.getStudioSceneInfo === "function")
                    ? StudioScene.getStudioSceneInfo()
                    : null;

                const scene = info?.scene;
                const obj = (scene && name) ? scene.getObjectByName(name) : null;

                if (obj){
                    position = position ?? obj.position;
                    rotation = rotation ?? obj.quaternion;
                }
            } catch (_) {}
        }

        const usedName = instData?.name ?? instData?.internalName ?? instEntry?.name ?? "(unknown)";
        if (!position) throw new Error(`INST export: missing position for "${usedName}"`);
        if (!rotation) throw new Error(`INST export: missing rotation for "${usedName}"`);

        return { position, rotation };
    }

    /**
     * @param game {Game}
     * @param level {string}
     * @param isEntity2 {boolean}
     * @returns {NBinary}
     */
    static build(game, level, isEntity2){

        // what the UI likely requested
        let preferredFile = isEntity2 ? "entity2.inst" : "entity.inst";
        if (game.game === Games.GAMES.MANHUNT_2){
            // MH2 PC default
            preferredFile = "entity_pc.inst";
        }

        // robust search (prevents exporting 0 entries / 4KB)
        const fallback = [
            "entity.inst",
            "entity2.inst",
            "entity_pc.inst",
            "entity_pc2.inst"
        ].filter((f) => f !== preferredFile);

        const pick = Inst._pickInstEntries(game, level, preferredFile, fallback);
        const instEntries = pick.entries;

        if (!instEntries.length){
            throw new Error(
                `INST export: found 0 entries for level "${level}". ` +
                `Requested "${preferredFile}". Available: ${pick.available.join(", ") || "(none)"}`
            );
        }

        // main file buffer (1MB is enough; final output trimmed by end())
        const binary = new NBinary(new ArrayBuffer(1024 * 1024));

        binary.setInt32(instEntries.length);

        const recordBin = [];

        instEntries.forEach(function (instEntry) {

            const instData = instEntry.data();

            // per-record buffer (keep small; records are usually < 1KB)
            const entry = new NBinary(new ArrayBuffer(64 * 1024));

            // record / names (keep compatible with your existing loader)
            const glgRecord =
                instEntry?.props?.glgRecord ??
                instData?.glgRecord ??
                instData?.record ??
                "";

            const internalName =
                instData?.name ??
                instData?.internalName ??
                instEntry?.name ??
                "";

            entry.writeString(glgRecord, 0x00, true, 0x70);
            entry.writeString(internalName, 0x00, true, 0x70);

            const { position, rotation } = Inst._resolveTransform(instEntry, instData);

            // editor(three) -> inst(file)
            entry.setFloat32(position.x);
            entry.setFloat32(position.z * -1);
            entry.setFloat32(position.y);

            entry.setFloat32(rotation.x);
            entry.setFloat32(rotation.z * -1);
            entry.setFloat32(rotation.y * -1);
            entry.setFloat32(rotation.w);

            if (instData.entityClass){
                entry.writeString(instData.entityClass, 0x00, true, 0x70);
            }

            // Parameters:
            // IMPORTANT: do NOT rely on instData.settings being an array; in your codebase it can be an object (e.g. settings.radius).
            const params =
                (Array.isArray(instData?.parameters) ? instData.parameters :
                 (Array.isArray(instData?.settings) ? instData.settings : []));

            params.forEach(function (setting) {
                if (!setting || typeof setting !== "object") return;

                if (game.game === Games.GAMES.MANHUNT_2){
                    // accept hash number or parameterId string
                    const h = Inst._hashToI32(setting.hash !== undefined ? setting.hash : setting.parameterId);
                    if (h === null){
                        console.log("INST: skipping MH2 parameter without valid hash/parameterId", setting);
                        return;
                    }

                    entry.setInt32(h);

                    // type is 3 chars in files ("int","boo","flo","str") + padding byte
                    const t = String(setting.type ?? "int").slice(0, 3);
                    entry.writeString(t, 0x00, true, 0x70);
                }

                const type = String(setting.type ?? "int");
                switch (type) {
                    case "flo":
                        entry.setFloat32(setting.value);
                        break;
                    case "boo":
                    case "int":
                        entry.setInt32(setting.value);
                        break;
                    case "str":
                        entry.writeString(String(setting.value ?? ""), 0x00, true, 0x70);
                        break;
                }
            });

            entry.end();
            recordBin.push(entry);
        });

        recordBin.forEach(function (entry) {
            binary.setInt32(entry.length());
        });

        recordBin.forEach(function (entry) {
            binary.append(entry);
        });

        binary.end();
        return binary;
    }
}
