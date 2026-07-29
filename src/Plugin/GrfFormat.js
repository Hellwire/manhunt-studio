import Games from "./Games.js";

export const GRF_MAGIC = "GNIA";
export const GRF_VERSION = 1;
export const GRF_PADDING = 0x70;
export const GRF_MAX_COUNT = 1000000;

export class GrfError extends Error {
    constructor(message, offset = null) {
        super(offset === null ? message : `${message} at offset 0x${offset.toString(16).toUpperCase()}`);
        this.name = "GrfError";
        this.offset = offset;
    }
}

function toBytes(input) {
    if (input && input.data instanceof ArrayBuffer) {
        return new Uint8Array(input.data);
    }

    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }

    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }

    throw new GrfError("GRF input is not an ArrayBuffer");
}

function isInt32(value) {
    return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

function requireInt32(value, label) {
    if (!isInt32(value)) {
        throw new GrfError(`${label} must be a signed 32-bit integer (received ${String(value)})`);
    }
    return value;
}

function requireArray(value, label) {
    if (!Array.isArray(value)) {
        throw new GrfError(`${label} must be an array`);
    }
    return value;
}

function validateByteValues(values, label) {
    requireArray(values, label).forEach(function (value, index) {
        requireInt32(value, `${label} ${index}`);
        if (value < 0 || value > 255) {
            throw new GrfError(`${label} ${index} value ${value} exceeds the runtime byte range`);
        }
    });
}

class GrfReader {
    constructor(input, source) {
        this.bytes = toBytes(input);
        this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
        this.source = source || "<memory>";
        this.offset = 0;
    }

    get remaining() {
        return this.bytes.byteLength - this.offset;
    }

    fail(message, offset = this.offset) {
        return new GrfError(`${this.source}: ${message}`, offset);
    }

    require(size, label) {
        if (!Number.isInteger(size) || size < 0 || size > this.remaining) {
            throw this.fail(`truncated ${label} (need ${size} bytes, have ${this.remaining})`);
        }
    }

    readBytes(size, label) {
        this.require(size, label);
        const start = this.offset;
        this.offset += size;
        return this.bytes.subarray(start, this.offset);
    }

    int32(label) {
        this.require(4, label);
        const value = this.view.getInt32(this.offset, true);
        this.offset += 4;
        return value;
    }

    float32(label) {
        this.require(4, label);
        const value = this.view.getFloat32(this.offset, true);
        const valueOffset = this.offset;
        this.offset += 4;
        if (!Number.isFinite(value)) {
            throw this.fail(`${label} is not finite`, valueOffset);
        }
        return value;
    }

    count(label, minimumRecordSize = 0) {
        const countOffset = this.offset;
        const count = this.int32(`${label} count`);
        if (count < 0 || count > GRF_MAX_COUNT) {
            throw this.fail(`invalid ${label} count ${count}`, countOffset);
        }
        if (minimumRecordSize > 0 && count * minimumRecordSize > this.remaining) {
            throw this.fail(`${label} count ${count} cannot fit in the remaining file`, countOffset);
        }
        return count;
    }

    alignedString(label) {
        const start = this.offset;
        let nul = start;
        while (nul < this.bytes.byteLength && this.bytes[nul] !== 0) {
            nul++;
        }
        if (nul === this.bytes.byteLength) {
            throw this.fail(`unterminated ${label}`, start);
        }

        let result = "";
        for (let index = start; index < nul; index++) {
            result += String.fromCharCode(this.bytes[index]);
        }

        const alignedEnd = (nul + 4) & ~3;
        if (alignedEnd > this.bytes.byteLength) {
            throw this.fail(`truncated alignment padding after ${label}`, nul + 1);
        }
        this.offset = alignedEnd;
        return result;
    }

    intBlock(label) {
        const count = this.count(label, 4);
        const values = [];
        for (let index = 0; index < count; index++) {
            values.push(this.int32(`${label} ${index}`));
        }
        return values;
    }
}

class GrfWriter {
    constructor(initialCapacity = 4096) {
        this.bytes = new Uint8Array(initialCapacity);
        this.view = new DataView(this.bytes.buffer);
        this.offset = 0;
    }

    ensure(size) {
        const required = this.offset + size;
        if (required <= this.bytes.byteLength) return;

        let capacity = this.bytes.byteLength;
        while (capacity < required) {
            capacity = Math.max(capacity * 2, required);
        }

        const grown = new Uint8Array(capacity);
        grown.set(this.bytes);
        this.bytes = grown;
        this.view = new DataView(grown.buffer);
    }

    uint8(value) {
        this.ensure(1);
        this.bytes[this.offset++] = value;
    }

    rawAscii(value) {
        for (let index = 0; index < value.length; index++) {
            this.uint8(value.charCodeAt(index));
        }
    }

    int32(value, label) {
        requireInt32(value, label);
        this.ensure(4);
        this.view.setInt32(this.offset, value, true);
        this.offset += 4;
    }

    float32(value, label) {
        if (!Number.isFinite(value)) {
            throw new GrfError(`${label} must be finite`);
        }
        this.ensure(4);
        this.view.setFloat32(this.offset, value, true);
        this.offset += 4;
    }

    alignedString(value, label) {
        if (typeof value !== "string") {
            throw new GrfError(`${label} must be a string`);
        }

        for (let index = 0; index < value.length; index++) {
            const code = value.charCodeAt(index);
            if (code === 0) {
                throw new GrfError(`${label} contains an embedded NUL byte`);
            }
            if (code > 255) {
                throw new GrfError(`${label} contains a character that cannot be stored in the byte-based GRF format`);
            }
            this.uint8(code);
        }

        this.uint8(0);
        while ((this.offset & 3) !== 0) {
            this.uint8(GRF_PADDING);
        }
    }

    intBlock(values, label) {
        requireArray(values, label);
        this.int32(values.length, `${label} count`);
        values.forEach((value, index) => this.int32(value, `${label} ${index}`));
    }

    finish() {
        return this.bytes.slice(0, this.offset).buffer;
    }
}

export function validateGrf(graph, source = "<memory>") {
    if (!graph || (graph.game !== Games.GAMES.MANHUNT && graph.game !== Games.GAMES.MANHUNT_2)) {
        throw new GrfError(`${source}: unsupported GRF game ${String(graph && graph.game)}`);
    }

    const areas = requireArray(graph.areas, `${source}: areas`);
    const routes = requireArray(graph.routes, `${source}: routes`);
    const groupNames = requireArray(graph.groupNames, `${source}: group names`);

    if (areas.length > GRF_MAX_COUNT || routes.length > GRF_MAX_COUNT || groupNames.length > GRF_MAX_COUNT) {
        throw new GrfError(`${source}: a top-level GRF count exceeds ${GRF_MAX_COUNT}`);
    }
    if (groupNames.length > 256) {
        throw new GrfError(`${source}: group count ${groupNames.length} exceeds the runtime byte index`);
    }

    groupNames.forEach(function (name, index) {
        if (typeof name !== "string") {
            throw new GrfError(`${source}: group name ${index} is not a string`);
        }
    });

    areas.forEach(function (area, areaIndex) {
        const prefix = `${source}: area ${areaIndex}`;
        if (!area || typeof area.name !== "string" || typeof area.nodeName !== "string") {
            throw new GrfError(`${prefix} has an invalid name or node name`);
        }
        requireInt32(area.groupIndex, `${prefix} group index`);
        if (area.groupIndex < -1 || area.groupIndex >= groupNames.length) {
            throw new GrfError(`${prefix} has out-of-range group index ${area.groupIndex} (group count ${groupNames.length})`);
        }
        if (!area.position || !Number.isFinite(area.position.x) ||
            !Number.isFinite(area.position.y) || !Number.isFinite(area.position.z)) {
            throw new GrfError(`${prefix} has a non-finite position`);
        }
        if (!Number.isFinite(area.radius) || area.radius < 0) {
            throw new GrfError(`${prefix} has invalid radius ${String(area.radius)}`);
        }

        const flags = requireArray(area.flags, `${prefix} primary flags`);
        const flags2 = requireArray(area.flags2, `${prefix} secondary flags`);
        flags.forEach((value, index) => requireInt32(value, `${prefix} primary flag ${index}`));
        flags2.forEach((value, index) => requireInt32(value, `${prefix} secondary flag ${index}`));

        if (graph.game === Games.GAMES.MANHUNT_2 && flags.length !== 0) {
            throw new GrfError(`${prefix} has data in the MH2 primary list; the PC runtime skips only its count`);
        }
        validateByteValues(
            graph.game === Games.GAMES.MANHUNT_2 ? flags2 : flags,
            `${prefix} membership`
        );

        const waypoints = requireArray(area.waypoints, `${prefix} waypoints`);
        if (waypoints.length > 255) {
            throw new GrfError(`${prefix} has ${waypoints.length} waypoint links, exceeding the runtime byte count`);
        }
        waypoints.forEach(function (waypoint, waypointIndex) {
            const waypointPrefix = `${prefix} waypoint ${waypointIndex}`;
            if (!waypoint) {
                throw new GrfError(`${waypointPrefix} is missing`);
            }
            requireInt32(waypoint.linkId, `${waypointPrefix} link`);
            requireInt32(waypoint.type, `${waypointPrefix} type`);
            if (waypoint.linkId < 0 || waypoint.linkId >= areas.length) {
                throw new GrfError(`${waypointPrefix} has out-of-range link ${waypoint.linkId} (area count ${areas.length})`);
            }
            validateByteValues(waypoint.relations, `${waypointPrefix} relation`);
        });

        if (graph.game === Games.GAMES.MANHUNT_2) {
            const tail = area.tail === undefined ? [0, 0] : area.tail;
            if (!Array.isArray(tail) || tail.length !== 2 || tail[0] !== 0 || tail[1] !== 0) {
                throw new GrfError(`${prefix} has an unsupported nonzero MH2 tail`);
            }
        }
    });

    routes.forEach(function (route, routeIndex) {
        const prefix = `${source}: route ${routeIndex}`;
        if (!route || typeof route.name !== "string") {
            throw new GrfError(`${prefix} has an invalid name`);
        }
        requireArray(route.entries, `${prefix} entries`).forEach(function (areaIndex, entryIndex) {
            requireInt32(areaIndex, `${prefix} entry ${entryIndex}`);
            if (areaIndex < 0 || areaIndex >= areas.length) {
                throw new GrfError(`${prefix} entry ${entryIndex} has out-of-range area ${areaIndex} (area count ${areas.length})`);
            }
        });
    });

    return graph;
}

export function parseGrf(input, source = "<memory>") {
    const reader = new GrfReader(input, source);
    if (reader.remaining < 4) {
        throw reader.fail("file is too short", 0);
    }

    const firstFour = reader.readBytes(4, "GRF header");
    const magic = String.fromCharCode(firstFour[0], firstFour[1], firstFour[2], firstFour[3]);

    let game;
    let version = null;
    let areaCount;
    if (magic === GRF_MAGIC) {
        game = Games.GAMES.MANHUNT_2;
        version = reader.int32("GNIA version");
        if (version !== GRF_VERSION) {
            throw reader.fail(`unsupported GNIA version ${version}`, 4);
        }
        areaCount = reader.count("area");
    } else {
        game = Games.GAMES.MANHUNT;
        reader.offset = 0;
        areaCount = reader.count("area");
    }

    const areas = [];
    for (let areaIndex = 0; areaIndex < areaCount; areaIndex++) {
        const prefix = `area ${areaIndex}`;
        const area = {
            name: reader.alignedString(`${prefix} name`),
            groupIndex: reader.int32(`${prefix} group index`),
            position: {
                x: reader.float32(`${prefix} position x`),
                y: reader.float32(`${prefix} position y`),
                z: reader.float32(`${prefix} position z`)
            },
            radius: reader.float32(`${prefix} radius`),
            nodeName: reader.alignedString(`${prefix} node name`),
            flags: reader.intBlock(`${prefix} primary flag`),
            flags2: [],
            waypoints: [],
            tail: null
        };

        if (game === Games.GAMES.MANHUNT_2) {
            area.flags2 = reader.intBlock(`${prefix} secondary flag`);
        }

        const waypointCount = reader.count(`${prefix} waypoint`, 12);
        for (let waypointIndex = 0; waypointIndex < waypointCount; waypointIndex++) {
            const waypointPrefix = `${prefix} waypoint ${waypointIndex}`;
            area.waypoints.push({
                linkId: reader.int32(`${waypointPrefix} link`),
                type: reader.int32(`${waypointPrefix} type`),
                relations: reader.intBlock(`${waypointPrefix} relation`)
            });
        }

        if (game === Games.GAMES.MANHUNT_2) {
            area.tail = [
                reader.int32(`${prefix} tail 1`),
                reader.int32(`${prefix} tail 2`)
            ];
        }
        areas.push(area);
    }

    const routeCount = reader.count("route");
    const routes = [];
    for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
        routes.push({
            name: reader.alignedString(`route ${routeIndex} name`),
            entries: reader.intBlock(`route ${routeIndex} entry`)
        });
    }

    const groupCount = reader.count("group name");
    const groupNames = [];
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        groupNames.push(reader.alignedString(`group name ${groupIndex}`));
    }

    if (reader.remaining !== 0) {
        throw reader.fail(`${reader.remaining} unexpected trailing bytes`);
    }

    return validateGrf({
        game: game,
        version: version,
        areas: areas,
        routes: routes,
        groupNames: groupNames
    }, source);
}

export function writeGrf(graph, source = "<editor>") {
    validateGrf(graph, source);
    const writer = new GrfWriter();

    if (graph.game === Games.GAMES.MANHUNT_2) {
        writer.rawAscii(GRF_MAGIC);
        writer.int32(GRF_VERSION, "GNIA version");
    }

    writer.int32(graph.areas.length, "area count");
    graph.areas.forEach(function (area, areaIndex) {
        const prefix = `area ${areaIndex}`;
        writer.alignedString(area.name, `${prefix} name`);
        writer.int32(area.groupIndex, `${prefix} group index`);
        writer.float32(area.position.x, `${prefix} position x`);
        writer.float32(area.position.y, `${prefix} position y`);
        writer.float32(area.position.z, `${prefix} position z`);
        writer.float32(area.radius, `${prefix} radius`);
        writer.alignedString(area.nodeName, `${prefix} node name`);
        writer.intBlock(area.flags, `${prefix} primary flags`);

        if (graph.game === Games.GAMES.MANHUNT_2) {
            writer.intBlock(area.flags2, `${prefix} secondary flags`);
        }

        writer.int32(area.waypoints.length, `${prefix} waypoint count`);
        area.waypoints.forEach(function (waypoint, waypointIndex) {
            const waypointPrefix = `${prefix} waypoint ${waypointIndex}`;
            writer.int32(waypoint.linkId, `${waypointPrefix} link`);
            writer.int32(waypoint.type, `${waypointPrefix} type`);
            writer.intBlock(waypoint.relations, `${waypointPrefix} relations`);
        });

        if (graph.game === Games.GAMES.MANHUNT_2) {
            writer.int32(0, `${prefix} tail 1`);
            writer.int32(0, `${prefix} tail 2`);
        }
    });

    writer.int32(graph.routes.length, "route count");
    graph.routes.forEach(function (route, routeIndex) {
        writer.alignedString(route.name, `route ${routeIndex} name`);
        writer.intBlock(route.entries, `route ${routeIndex} entries`);
    });

    writer.int32(graph.groupNames.length, "group name count");
    graph.groupNames.forEach(function (name, groupIndex) {
        writer.alignedString(name, `group name ${groupIndex}`);
    });

    return writer.finish();
}

export function fileToEditorPosition(game, position) {
    if (game === Games.GAMES.MANHUNT_2) {
        return {x: position.x, y: position.y, z: position.z};
    }
    if (game === Games.GAMES.MANHUNT) {
        return {x: position.x, y: position.z, z: -position.y};
    }
    throw new GrfError(`unsupported GRF game ${String(game)}`);
}

export function editorToFilePosition(game, position) {
    if (game === Games.GAMES.MANHUNT_2) {
        return {x: position.x, y: position.y, z: position.z};
    }
    if (game === Games.GAMES.MANHUNT) {
        return {x: position.x, y: -position.z, z: position.y};
    }
    throw new GrfError(`unsupported GRF game ${String(game)}`);
}
