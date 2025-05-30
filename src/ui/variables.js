const canvas = document.getElementById('canvas');
export let RECORDING_ON = false;
export let RECORDED_FRAMES = [];
export let TURN_RECORDING_ON = () => {
    RECORDING_ON = true;
    RECORDED_FRAMES = [];
};
export let TURN_RECORDING_OFF = () => {
    RECORDING_ON = false;
};
export let ICON_SIZE = 80;
export let ICON_RADIUS = () => ICON_SIZE / Math.SQRT2;
export let CANVAS_WIDTH = () => canvas.width;
export let CANVAS_HEIGHT = () => canvas.height;
export function increaseIconSize() {
    ICON_SIZE = Math.min(160, ICON_SIZE + 10);
}
export function decreaseIconSize() {
    ICON_SIZE = Math.max(40, ICON_SIZE - 10);
}
export let ROUTER_INF_NUM = 3;
export let SWITCH_INF_NUM = 5;
//# sourceMappingURL=variables.js.map