/**
 * entity*.inst stores transforms in a different basis than the BSP/MapAI
 * world used by the MHS viewport. Manhunt 1 and retail Manhunt 2 use the same
 * native INST basis.
 */
export function fileToEditorPosition(position) {
    return {
        x: position.x,
        y: position.z,
        z: -position.y
    };
}

export function editorToFilePosition(position) {
    return {
        x: position.x,
        y: -position.z,
        z: position.y
    };
}

/**
 * INST yaw has the opposite handedness from Three after the Z-up to Y-up axis
 * swap. Keep the other stored axes unchanged and invert only file Z/editor Y.
 */
export function fileToEditorRotation(rotation) {
    return {
        x: rotation.x,
        y: -rotation.z,
        z: -rotation.y,
        w: rotation.w
    };
}

export function editorToFileRotation(rotation) {
    return {
        x: rotation.x,
        y: -rotation.z,
        z: -rotation.y,
        w: rotation.w
    };
}
