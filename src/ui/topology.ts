import { Device, PersonalComputer, Router, Switch } from "../device.js";
import { InfMatrix } from "../interface.js";
import { CableList } from "./cable.js";
import { canvas, ctx, initCanvas, pc_img, redrawCanvas, router_img, server_img, setDPI, switch_img } from "./canvas-init.js";
import { displayFrames } from "./configure.js";
import { ICON_SIZE, RECORDING_ON, ROUTER_INF_NUM, SWITCH_INF_NUM, TURN_RECORDING_OFF, TURN_RECORDING_ON, decreaseIconSize, increaseIconSize } from "./variables.js";

let current_click_func: (x: number, y: number) => void = selectDevice;
setDPI(canvas, 192);
initCanvas();

let draggable = false;
export let focusedDevice: Device = undefined;
export function clearFocus() {
    focusedDevice = undefined;
}

canvas.onmousedown = (e) => {
    if (0 <= e.offsetX && e.offsetX <= canvas.width && 0 <= e.offsetY && e.offsetY <= canvas.height) {
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
};
canvas.onmouseout = (e) => {
    draggable = false;
};

function selectDevice(x: number, y: number) {
    const device = Device.getDevice(x, y);
    if (device !== undefined) {
        draggable = true;
        focusedDevice = device;
        setTimeout(() => {
            redrawCanvas();
        }, 0);
    }
}

function deleteElement(x: number, y: number) {
    document.body.style.cursor = 'crosshair'
    if (Device.deleteDevice(x, y)) {
        clearFocus();
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

function connectDevices(x: number, y: number) {
    if (focusedDevice === undefined) {
        focusedDevice = Device.getDevice(x, y);
        redrawCanvas();
    }
    else {
        let firstDevice = focusedDevice;
        let secondDevice = Device.getDevice(x, y);
        if (secondDevice !== undefined && secondDevice !== firstDevice) {
            Device.connectDevices(firstDevice, secondDevice)
            resetMode();
            redrawCanvas();
        }
    }
}

function resetMode() {
    current_click_func = selectDevice;
    document.body.style.cursor = 'default';
    redrawCanvas();
} (<any>window).resetMode = resetMode;

function connectMode() {
    clearFocus();
    document.body.style.cursor = 'crosshair'
    current_click_func = connectDevices;
} (<any>window).connectMode = connectMode;

function deleteMode() {
    clearFocus();
    document.body.style.cursor = 'crosshair';
    current_click_func = deleteElement;
} (<any>window).deleteMode = deleteMode;

function toggleRecord(ele: HTMLElement) {
    const button = document.getElementById("recording-btn");
    if (RECORDING_ON) {
        button.setAttribute('src', "assets/icons/recording-off.svg")
        ele.setAttribute('title', "Begin Recording")
        TURN_RECORDING_OFF();
        displayFrames();
    }
    else {
        button.setAttribute('src', "assets/icons/recording-on.svg")
        ele.setAttribute('title', "End Recording")
        TURN_RECORDING_ON();
    }
} (<any>window).toggleRecord = toggleRecord;
(<any>window).showRecentRecording = displayFrames;

function createMode(name: string) {
    document.body.style.cursor = 'crosshair'
    switch (name.toUpperCase()) {
        case ("PC"):
            current_click_func = (x: number, y: number) => {
                Device.createDevice(new PersonalComputer(), x, y);
                ctx.drawImage(pc_img, x-ICON_SIZE/2, y-ICON_SIZE/2, ICON_SIZE, ICON_SIZE);
                resetMode();
            }
            break;
        case ("SERVER"):
            current_click_func = (x: number, y: number) => {
                Device.createDevice(new PersonalComputer(), x, y);
                ctx.drawImage(server_img, x-ICON_SIZE/2, y-ICON_SIZE/2, ICON_SIZE, ICON_SIZE);
                resetMode();
                // eventually will have to add specialized features to server
            }
            break;
        case ("ROUTER"):
            current_click_func = (x: number, y: number) => {
                Device.createDevice(new Router(ROUTER_INF_NUM), x, y);
                ctx.drawImage(router_img, x-ICON_SIZE/2, y-ICON_SIZE/2, ICON_SIZE, ICON_SIZE);
                resetMode();
            }
            break;
        case ("SWITCH"):
            current_click_func = (x: number, y: number) => {
                Device.createDevice(new Switch(SWITCH_INF_NUM), x, y);
                ctx.drawImage(switch_img, x-ICON_SIZE/2, y-ICON_SIZE/2, ICON_SIZE, ICON_SIZE);
                resetMode();
            }
            break;
        default:
            resetMode();
            return;
    }

} (<any>window).createMode = createMode;

function incIconSize() {
    increaseIconSize();
    redrawCanvas(false);
} (<any>window).incIconSize = incIconSize;

function decIconSize() {
    decreaseIconSize();
    redrawCanvas(false);
} (<any>window).decIconSize = decIconSize;