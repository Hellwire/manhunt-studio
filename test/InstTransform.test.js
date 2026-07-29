import assert from "assert";
import {
    editorToFilePosition,
    editorToFileRotation,
    fileToEditorPosition,
    fileToEditorRotation
} from "../src/Plugin/InstTransform.js";

describe("INST coordinate transforms", function () {
    it("round-trips native position coordinates", function () {
        const stored = {x: 10, y: 20, z: 30};
        assert.deepStrictEqual(fileToEditorPosition(stored), {x: 10, y: 30, z: -20});
        assert.deepStrictEqual(editorToFilePosition(fileToEditorPosition(stored)), stored);
    });

    it("round-trips native XYZW rotations", function () {
        const stored = {x: 0.1, y: 0.2, z: 0.3, w: 0.9};
        assert.deepStrictEqual(
            fileToEditorRotation(stored),
            {x: 0.1, y: -0.3, z: -0.2, w: 0.9}
        );
        assert.deepStrictEqual(editorToFileRotation(fileToEditorRotation(stored)), stored);
    });

    it("reverses A02 quarter-turn yaw without changing identity rotations", function () {
        const halfSqrt = Math.sqrt(0.5);
        assert.deepStrictEqual(
            fileToEditorRotation({x: 0, y: 0, z: -halfSqrt, w: halfSqrt}),
            {x: 0, y: halfSqrt, z: -0, w: halfSqrt}
        );
        assert.deepStrictEqual(
            fileToEditorRotation({x: 0, y: 0, z: 0, w: 1}),
            {x: 0, y: -0, z: -0, w: 1}
        );
    });
});
