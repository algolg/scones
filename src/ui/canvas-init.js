import { Device, DeviceType } from "../device.js";
import { InfMatrix } from "../interface.js";
import { Cable, CableList } from "./cable.js";
import { displayInfo, resetConfigurePanel } from "./configure.js";
import { focusedDevice } from "./topology.js";
import { ICON_SIZE } from "./variables.js";
export const canvas = document.getElementById('canvas');
export const topology = document.getElementById('topology');
canvas.width = topology.clientWidth;
canvas.height = topology.clientHeight;
export const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;
export const pc_img = new Image();
export const server_img = new Image();
export const router_img = new Image();
export const switch_img = new Image();
const packet_img = new Image();
const packet_flipped_img = new Image();
pc_img.src = "assets/icons/pc.svg";
server_img.src = "assets/icons/server.svg";
router_img.src = "assets/icons/router.svg";
switch_img.src = "assets/icons/switch.svg";
packet_img.src = "assets/icons/packet.svg";
packet_flipped_img.src = "assets/icons/packet-flipped.svg";
pc_img.width = pc_img.height =
    server_img.width = server_img.height =
        router_img.width = router_img.height =
            switch_img.width = switch_img.height = ICON_SIZE;
packet_img.width = packet_img.height =
    packet_flipped_img.width = packet_flipped_img.height = ICON_SIZE / 2;
// https://stackoverflow.com/questions/14488849/higher-dpi-graphics-with-html5-canvas
export function setDPI(canvas, dpi) {
    // Set up CSS size.
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
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
    ctx.clearRect(0, 0, width, height);
    CableList.splice(0, CableList.length);
    ctx.beginPath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    for (let connection of InfMatrix.adjacency_list) {
        const scaled_coords_1 = [connection[0].coords[0] * canvas.width, connection[0].coords[1] * canvas.height];
        const scaled_coords_2 = [connection[1].coords[0] * canvas.width, connection[1].coords[1] * canvas.height];
        const new_cable = new Cable(scaled_coords_1, scaled_coords_2, connection[0].mac, connection[1].mac, connection[0].num, connection[1].num);
        CableList.push(new_cable);
        ctx.moveTo(new_cable.start_x, new_cable.start_y);
        ctx.lineTo(new_cable.end_x, new_cable.end_y);
        new_cable.drawLabels();
    }
    ctx.closePath();
    ctx.stroke();
    for (let device of Device.getIterator()) {
        const x = device.coords[0] * canvas.width;
        const y = device.coords[1] * canvas.height;
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
                break;
        }
        ctx.drawImage(img, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
    }
}
export function redrawCanvas(display = true) {
    initCanvas();
    if (focusedDevice !== undefined) {
        if (display) {
            displayInfo(focusedDevice);
        }
        ctx.beginPath();
        ctx.strokeStyle = '#44668866';
        ctx.rect(focusedDevice.coords[0] * canvas.width - ICON_SIZE / 2 - 5, focusedDevice.coords[1] * canvas.height - ICON_SIZE / 2 - 5, ICON_SIZE + 10, ICON_SIZE + 10);
        ctx.closePath();
        ctx.stroke();
    }
    else {
        if (display) {
            resetConfigurePanel();
        }
    }
}
export function drawFrame(...frame_info_set) {
    redrawCanvas(false);
    for (let frame_info of frame_info_set) {
        const x = frame_info[0] * canvas.width;
        const y = frame_info[1] * canvas.height;
        let frame_angle = frame_info[2];
        let img = packet_img;
        if (frame_angle > Math.PI / 2 || frame_angle < -Math.PI / 2) {
            frame_angle += Math.PI;
            img = packet_flipped_img;
        }
        ctx.translate(x, y);
        ctx.rotate(frame_angle);
        ctx.drawImage(img, -ICON_SIZE / 4, -ICON_SIZE / 4, ICON_SIZE / 2, ICON_SIZE / 2);
        ctx.rotate(-frame_angle);
        ctx.translate(-x, -y);
    }
}
window.drawFrame = drawFrame;
window.onresize = () => {
    canvas.width = topology.clientWidth;
    canvas.height = topology.clientHeight;
    setDPI(canvas, 192);
    redrawCanvas(false);
};
//# sourceMappingURL=canvas-init.js.map