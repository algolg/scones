import { Device, DeviceType } from "../device.js";
import { ICON_SIZE } from "./variables.js";

export const canvas = <HTMLCanvasElement>document.getElementById('canvas');
export const topology = <HTMLDivElement>document.getElementById('topology');
canvas.width = topology.clientWidth;
canvas.height = topology.clientHeight;
export const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;

export const pc_img = new Image();
export const server_img = new Image();
export const router_img = new Image();
export const switch_img = new Image();
pc_img.src = "assets/icons/pc.svg";
server_img.src = "assets/icons/server.svg";
router_img.src = "assets/icons/router.svg";
switch_img.src = "assets/icons/switch.svg";
pc_img.width = pc_img.height =
server_img.width = server_img.height =
router_img.width = router_img.height =
switch_img.width = switch_img.height = ICON_SIZE;

// https://stackoverflow.com/questions/14488849/higher-dpi-graphics-with-html5-canvas
export function setDPI(canvas, dpi) {
    // Set up CSS size.
    canvas.style.width = canvas.style.width || canvas.width + 'px';
    canvas.style.height = canvas.style.height || canvas.height + 'px';

    // Get size information.
    var scaleFactor = dpi / 96;
    var width = parseFloat(canvas.style.width);
    var height = parseFloat(canvas.style.height);

    // Backup the canvas contents.
    var oldScale = canvas.width / width;
    var backupScale = scaleFactor / oldScale;
    var backup = canvas.cloneNode(false);
    backup.getContext('2d').drawImage(canvas, 0, 0);

    // Resize the canvas.
    var ctx = canvas.getContext('2d');
    canvas.width = Math.ceil(width * scaleFactor);
    canvas.height = Math.ceil(height * scaleFactor);

    // Redraw the canvas image and scale future draws.
    ctx.setTransform(backupScale, 0, 0, backupScale, 0, 0);
    ctx.drawImage(backup, 0, 0);
    ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
}

export function initCanvas() {
    const height = canvas.height;
    const width = canvas.width;

    ctx.clearRect(0,0,width,height);

    // for (let x = -4; x <= width + 20; x += 20) {
    //     ctx.moveTo(x, 0);
    //     ctx.lineTo(x, height);
    // }
    // for (let y = -4; y <= height + 20; y += 20) {
    //     ctx.moveTo(0, y);
    //     ctx.lineTo(width, y);
    // }
    // ctx.strokeStyle = '#afaa9155';
    // ctx.stroke();

    for (let device of Device.getIterator()) {
        const x = device.coords[0];
        const y = device.coords[1];
        let img;
        switch (device.device_type) {
            case DeviceType.PC:
                img = pc_img;
                break;
            case DeviceType.SERVER:
                img = server_img;
                break;
            case DeviceType.ROUTER:
                img = router_img;
                break;
            case DeviceType.SWITCH:
                img = switch_img;
                break
        }
        ctx.drawImage(img, x-ICON_SIZE/2, y-ICON_SIZE/2, ICON_SIZE, ICON_SIZE);
    }
}

export function resetCanvas() {
    initCanvas();
}