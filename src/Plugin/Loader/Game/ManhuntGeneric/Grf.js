import AbstractLoader from "./../../Abstract.js";
import Result from "../../Result.js";
import NBinary from "../../../../NBinary.js";
import Studio from "../../../../Studio.js";
import Games from "../../../../Plugin/Games.js";
import {MathUtils} from "../../../../Vendor/three.module.js";

export default class Grf extends AbstractLoader{
    static name = "Waypoints (Manhunt 1/2)";

    /**
     * @param entry {Result}
     */
    static update(entry){
        // Keep route entries synced with locations if the UI edits locations.
        // This avoids exporting stale route.props.entries later.
        if (!entry || !entry.props) return;

        if (entry.type === Studio.WAYPOINT_ROUTE){
            let route = entry.props;

            if (Array.isArray(route.locations) && route.locations.length > 0){
                let entries = [];
                route.locations.forEach(function (loc) {
                    if (!loc || !loc.props) return;
                    if (typeof loc.props.id === "number") entries.push(loc.props.id);
                    else if (typeof loc.props.id === "string" && /^-?\d+$/.test(loc.props.id)) entries.push(parseInt(loc.props.id, 10));
                });
                route.entries = entries;
            }else if (Array.isArray(route.entries)){
                // Normalize numeric strings
                route.entries = route.entries.map(function (e) {
                    if (typeof e === "number") return e;
                    if (typeof e === "string" && /^-?\d+$/.test(e)) return parseInt(e, 10);
                    return e;
                }).filter(function (e) { return typeof e === "number"; });
            }
        }

        // Normalize waypoint link ids if present
        if (entry.type === Studio.AREA_LOCATION && Array.isArray(entry.props.waypoints)){
            entry.props.waypoints.forEach(function (wp) {
                if (!wp) return;
                if (typeof wp.linkId === "string" && /^-?\d+$/.test(wp.linkId)) wp.linkId = parseInt(wp.linkId, 10);
                if (!Array.isArray(wp.relation)) wp.relation = [];
            });
        }
    }

    // -----------------------
    // canHandle probe helpers
    // -----------------------

    static _probeBlock(binary, maxCount){
        if (binary.remain() < 4) return false;
        let count = binary.int32();
        if (count < 0 || count > maxCount) return false;
        if (binary.remain() < count * 4) return false;
        binary.seek(count * 4);
        return true;
    }

    static _probeWaypointBlock(binary, maxWp, maxRel){
        if (binary.remain() < 4) return false;
        let count = binary.int32();
        if (count < 0 || count > maxWp) return false;

        for (let i = 0; i < count; i++){
            if (binary.remain() < 8) return false;
            binary.int32(); // linkId
            binary.int32(); // type
            if (!Grf._probeBlock(binary, maxRel)) return false;
        }
        return true;
    }

    static _probeFirstArea(binary, game){
        // name (fixed 0x70 in file, getString(0,true) handles alignment in this project)
        binary.getString(0, true);

        if (binary.remain() < 4 + 12 + 4) return false;
        let groupIndex = binary.int32();
        if (!Number.isFinite(groupIndex) || groupIndex < -1 || groupIndex > 1000000) return false;

        let pos = binary.readVector3();
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return false;

        let radius = binary.float32();
        if (!Number.isFinite(radius) || radius < 0 || radius > 1e9) return false;

        // nodeName (fixed 0x70)
        binary.getString(0, true);

        // unkFlags
        if (!Grf._probeBlock(binary, 100000)) return false;

        // unkFlags2 (MH2)
        if (game === Games.GAMES.MANHUNT_2){
            if (!Grf._probeBlock(binary, 100000)) return false;
        }

        // waypoints
        if (!Grf._probeWaypointBlock(binary, 100000, 100000)) return false;

        // trailing zeros (MH2)
        if (game === Games.GAMES.MANHUNT_2){
            if (binary.remain() < 8) return false;
            binary.int32();
            binary.int32();
        }

        return true;
    }

    /**
     * @param binary {NBinary}
     * @returns {boolean}
     */
    static canHandle(binary){
        if (!binary || binary.remain() <= 0) return false;

        let start = 0;

        try{
            binary.setCurrent(0);

            // MH2 (GNIA)
            let fourCC = binary.consume(4, 'string');
            if (fourCC === "GNIA"){
                if (binary.remain() < 8) { binary.setCurrent(start); return false; }

                let constVal = binary.int32();
                let count = binary.int32();

                if (constVal !== 1) { binary.setCurrent(start); return false; }
                if (!Number.isFinite(count) || count <= 0 || count > 50000) { binary.setCurrent(start); return false; }

                // Probe only the first entry to avoid matching random bins
                if (!Grf._probeFirstArea(binary, Games.GAMES.MANHUNT_2)){
                    binary.setCurrent(start);
                    return false;
                }

                binary.setCurrent(start);
                return true;
            }

            // MH1
            binary.setCurrent(0);
            let count = binary.int32();
            if (!Number.isFinite(count) || count <= 0 || count > 50000){
                binary.setCurrent(start);
                return false;
            }

            if (!Grf._probeFirstArea(binary, Games.GAMES.MANHUNT)){
                binary.setCurrent(start);
                return false;
            }

            binary.setCurrent(start);
            return true;

        }catch (e){
            try { binary.setCurrent(start); } catch (_) {}
            return false;
        }
    }

    /**
     * @param binary {NBinary}
     * @param options {{}}
     * @returns {Result[]}
     */
    static list(binary, options){
        let game = Games.GAMES.MANHUNT;
        let results = [];

        binary.setCurrent(0);

        let count = binary.consume(4, 'int32');

        // GNIA :  Manhunt 2
        if (count === 1095323207){
            game = Games.GAMES.MANHUNT_2;
            binary.seek(4); //const
            count = binary.consume(4, 'int32');
        }

        let area = Grf.parseArea(binary, count, game);
        let waypointRoutes = Grf.parseWaypointRoutes(binary);
        let areaNames = Grf.parseAreaNames(binary);

        let locationById = {};

        area.forEach(function (location) {
            let result = new Result(
                Studio.AREA_LOCATION,
                `node_${MathUtils.generateUUID()}`,
                "",
                0,
                location,
                function(){
                    return location;
                }
            );

            result.props.areaName = (areaNames && areaNames[location.groupIndex] !== undefined) ? areaNames[location.groupIndex] : "";
            locationById[location.id] = result;

            results.push(result);
        });

        waypointRoutes.forEach(function (route) {

            // Normalize entries (numbers only)
            if (!Array.isArray(route.entries)) route.entries = [];
            route.entries = route.entries.map(function (e) {
                if (typeof e === "number") return e;
                if (typeof e === "string" && /^-?\d+$/.test(e)) return parseInt(e, 10);
                return e;
            }).filter(function (e) { return typeof e === "number"; });

            route.locations = [];
            route.entries.forEach(function (locationId) {
                if (locationById[locationId] !== undefined)
                    route.locations.push(locationById[locationId]);
            });

            results.push(new Result(
                Studio.WAYPOINT_ROUTE,
                route.name,
                "",
                0,
                route,
                function(){
                    return route;
                }
            ));
        });

        return results;
    }

    /**
     *
     * @param binary
     * @returns {string[]}
     */
    static parseAreaNames(binary){
        let count = binary.int32();

        let results = [];
        for(let x = 0; x < count; x++){
            results.push(binary.getString(0, true));
        }

        return results;
    }

    /**
     *
     * @param binary
     * @returns {{order:int, name: string, entries: int[] }[]}
     */
    static parseWaypointRoutes(binary){

        let count = binary.int32();

        let results = [];
        for(let i = 0; i < count; i++){
            results.push({
                'name' :  binary.getString(0, true),
                'entries' :  Grf.parseBlock(binary)
            });
        }

        return results;

    }

    /**
     *
     * @param binary
     * @param entryCount
     * @param game {}
     * @returns {{name: string, groupIndex: int, position: {x:double,y:double,z:double}, radius: double, nodeName: string, relation: int[], waypoints: mix[]}[]}
     */
    static parseArea(binary, entryCount, game){

        let entries = [];

        for(let i = 0; i < entryCount; i++){

            let entry = {
                id: i,
                name: binary.getString(0, true),
                groupIndex: binary.int32(),
                position: (function () {
                    let position = binary.readVector3();

                    if (game === Games.GAMES.MANHUNT_2){

                    }else{
                        let y = position.y;
                        position.y = position.z;
                        position.z = y * -1;
                    }

                    return position;
                })(),
                radius: binary.float32(),
                nodeName: binary.getString(0, true),
                unkFlags: Grf.parseBlock(binary)
            };

            if (game === Games.GAMES.MANHUNT_2){
                entry.unkFlags2 = Grf.parseBlock(binary);
            }

            entry.waypoints = Grf.parseWayPointBlock(binary);

            if (game === Games.GAMES.MANHUNT_2){
                let zero1 = binary.int32();
                if (zero1 !== 0) console.error("zero is not zero ...");
                let zero2 = binary.int32();
                if (zero2 !== 0) console.error("zero2 is not zero ...");
            }

            entries.push(entry);
        }

        return entries;
    }

    static parseBlock(binary){
        let count = binary.int32();

        let result = [];
        for(let x = 0; x < count; x++){
            result.push(binary.int32());
        }

        return result;
    }

    static parseWayPointBlock(binary){

        let count = binary.int32();

        let result = [];
        for(let x = 0; x < count; x++){

            let linkId1 = binary.int32();
            let type = binary.int32();

            let entry = {
                'linkId' :  linkId1,
                'type' :  type,
                'relation' :  Grf.parseBlock(binary)
            };

            result.push(entry);
        }

        return result;
    }
}
