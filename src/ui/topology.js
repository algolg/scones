import { Device, PersonalComputer, Router, Switch } from "../device.js";
import { canvas, ctx, initCanvas, pc_img, resetCanvas, router_img, server_img, setDPI, switch_img } from "./canvas-init.js";
import { ICON_SIZE } from "./variables.js";
let current_click_func = selectDevice;
setDPI(canvas, 192);
initCanvas();
const height = canvas.height;
const width = canvas.width;
let draggable = false;
let focusedDevice;
canvas.onmousedown = (e) => {
    if (0 <= e.offsetX && e.offsetX <= width && 0 <= e.offsetY && e.offsetY <= height) {
        current_click_func(e.offsetX, e.offsetY);
    }
};
canvas.onmousemove = (e) => {
    if (draggable && focusedDevice) {
        Device.moveDevice(focusedDevice, e.offsetX, e.offsetY);
        resetCanvas();
    }
};
canvas.onmouseup = (e) => {
    draggable = false;
    if (focusedDevice !== undefined) {
        console.log(focusedDevice.coords);
    }
};
canvas.onmouseout = (e) => {
    draggable = false;
};
function resetMode() {
    current_click_func = selectDevice;
    document.body.style.cursor = 'default';
}
function selectDevice(x, y) {
    const device = Device.getDevice(x, y);
    if (device !== undefined) {
        console.log("selected!");
        draggable = true;
        focusedDevice = device;
    }
}
function deleteDevice(x, y) {
    document.body.style.cursor = 'crosshair';
    if (Device.deleteDevice(x, y)) {
        console.log("deleted");
        resetCanvas();
        resetMode();
    }
    focusedDevice = undefined;
}
function connectDevices(x, y) {
    if (focusedDevice === undefined) {
        focusedDevice = Device.getDevice(x, y);
    }
    else {
        Device.connectDevices(focusedDevice, Device.getDevice(x, y));
        resetCanvas();
    }
}
function connect() {
    focusedDevice = undefined;
    document.body.style.cursor = 'crosshair';
    current_click_func = connectDevices;
}
function create(name) {
    document.body.style.cursor = 'crosshair';
    switch (name.toUpperCase()) {
        case ("PC"):
            current_click_func = (x, y) => {
                Device.createDevice(new PersonalComputer(), x, y);
                ctx.drawImage(pc_img, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
                resetMode();
            };
            break;
        case ("SERVER"):
            current_click_func = (x, y) => {
                Device.createDevice(new PersonalComputer(), x, y);
                ctx.drawImage(server_img, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
                resetMode();
                // eventually will have to add specialized features to server
            };
            break;
        case ("ROUTER"):
            current_click_func = (x, y) => {
                Device.createDevice(new Router(2), x, y);
                ctx.drawImage(router_img, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
                resetMode();
            };
            break;
        case ("SWITCH"):
            current_click_func = (x, y) => {
                Device.createDevice(new Switch(2), x, y);
                ctx.drawImage(switch_img, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
                resetMode();
            };
            break;
        default:
            resetMode();
            return;
    }
}
window.create = create;
//# sourceMappingURL=topology.js.map