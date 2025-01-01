import { Device, PersonalComputer, Router, Switch } from "../device.js";
import { InfMatrix } from "../interface.js";
import { CableList } from "./cable.js";
import { canvas, ctx, initCanvas, pc_img, redrawCanvas, router_img, server_img, setDPI, switch_img } from "./canvas-init.js";
import { displayInfo } from "./configure.js";
import { ICON_SIZE, decreaseIconSize, increaseIconSize } from "./variables.js";
let current_click_func = selectDevice;
setDPI(canvas, 192);
initCanvas();
const height = canvas.height;
const width = canvas.width;
let draggable = false;
export let focusedDevice = undefined;
canvas.onmousedown = (e) => {
    if (0 <= e.offsetX && e.offsetX <= width && 0 <= e.offsetY && e.offsetY <= height) {
        current_click_func(e.offsetX, e.offsetY);
    }
};
canvas.onmousemove = (e) => {
    if (draggable && focusedDevice) {
        Device.moveDevice(focusedDevice, e.offsetX, e.offsetY);
        redrawCanvas(false);
    }
    else if (current_click_func === selectDevice) {
        if (Device.existsDevice(e.offsetX, e.offsetY)) {
            document.body.style.cursor = 'pointer';
        }
        else {
            document.body.style.cursor = 'default';
        }
    }
};
canvas.onmouseup = (e) => {
    draggable = false;
    if (focusedDevice !== undefined) {
    }
    console.log(e.offsetX, e.offsetY);
};
canvas.onmouseout = (e) => {
    draggable = false;
};
function selectDevice(x, y) {
    const device = Device.getDevice(x, y);
    if (device !== undefined) {
        draggable = true;
        focusedDevice = device;
        redrawCanvas();
        displayInfo(device);
    }
}
function deleteElement(x, y) {
    document.body.style.cursor = 'crosshair';
    if (Device.deleteDevice(x, y)) {
        focusedDevice = undefined;
        resetMode();
    }
    else {
        for (let cable of CableList) {
            if (cable.isOn(x, y)) {
                InfMatrix.disconnect(cable.start_inf, cable.end_inf);
                resetMode();
                break;
            }
        }
    }
    redrawCanvas();
}
function connectDevices(x, y) {
    if (focusedDevice === undefined) {
        focusedDevice = Device.getDevice(x, y);
        redrawCanvas();
        console.log("got first device");
    }
    else {
        let firstDevice = focusedDevice;
        let secondDevice = Device.getDevice(x, y);
        if (secondDevice !== undefined && secondDevice !== firstDevice) {
            console.log("got second device");
            if (Device.connectDevices(firstDevice, secondDevice)) {
                console.log("connected!");
            }
            resetMode();
            redrawCanvas();
        }
    }
}
function resetMode() {
    current_click_func = selectDevice;
    document.body.style.cursor = 'default';
    redrawCanvas();
}
window.resetMode = resetMode;
function connectMode() {
    focusedDevice = undefined;
    document.body.style.cursor = 'crosshair';
    current_click_func = connectDevices;
}
window.connectMode = connectMode;
function deleteMode() {
    focusedDevice = undefined;
    document.body.style.cursor = 'crosshair';
    current_click_func = deleteElement;
}
window.deleteMode = deleteMode;
function createMode(name) {
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
                Device.createDevice(new Switch(5), x, y);
                ctx.drawImage(switch_img, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
                resetMode();
            };
            break;
        default:
            resetMode();
            return;
    }
}
window.createMode = createMode;
function incIconSize() {
    increaseIconSize();
    redrawCanvas();
}
window.incIconSize = incIconSize;
function decIconSize() {
    decreaseIconSize();
    redrawCanvas();
}
window.decIconSize = decIconSize;
//# sourceMappingURL=topology.js.map