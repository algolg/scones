import { Ipv4Address, Ipv4Prefix, MacAddress } from "../addressing.js";
import { Device } from "../device.js";
import { DisplayFrame } from "../frame.js";
import { IcmpControlMessage, IcmpDatagram, IcmpUnreachableCode } from "../icmp.js";
import { InfLayer, InfMatrix } from "../interface.js";
import { Ipv4Packet } from "../ip.js";
import { Protocol } from "../socket.js";
import { getExplanation } from "./explain.js";
import { focusedDevice } from "./topology.js";
import { RECORDED_FRAMES } from "./variables.js";

export const configurePanel = document.getElementById('configure-panel');

const interfaceConfig = (id_num: number, mac: MacAddress, layer: InfLayer, is_active: boolean, ipv4_address?: Ipv4Address, ipv4_prefix?: Ipv4Prefix) => 
`
<div class="config-option">
    <input id="eth${id_num}-dropdown" class="option-dropdown" type="checkbox">
    <label for="eth${id_num}-dropdown" class="option-dropdown-label interface-label">
        <div class="name">eth${id_num}</div>
        <div class="info-1">${is_active ? "Active" : "Inactive"}</div>
        <div class="info-2">${layer == InfLayer.L2 ? "Bridging" : "Routing"}</div>
        <div class="info-3">${layer == InfLayer.L3 ? ipv4_address : ''}</div>
    </label>
    <div class="option-dropdown-contents">
        <div>Mac Address: ${mac}</div>
        ${ layer == InfLayer.L3 ?
        `<div>
            <form class="option-form ip-change">
                <label for="ipv4-address">IPv4 Address</label>
                <input name="ipv4-address" onchange="updateIpv4Address(this)" class="mono" type="text" placeholder="A.B.C.D" value="${ipv4_address ?? ''}" num="${id_num}"/>
                <label for="ipv4-prefix">IPv4 Prefix</label>
                <input name="ipv4-prefix" onchange="updateIpv4Prefix(this)" class="mono" type="number" min="0" max="30" value="${ipv4_prefix.value ?? undefined}" num="${id_num}"/>
            </form>
        </div>`
        :
        ``
        }
    </div>
</div>
`

const routeConfig = (routes: [string, Ipv4Address, Ipv4Address, number][]) => {
    let table_rows = "";
    routes.forEach((route) => {
        let num = focusedDevice.l3infs.find((inf) => inf.ipv4.compare(route[2]) == 0).num;
        table_rows += `
        <tr>
            <td>${route[0]}</td>
            <td>${route[1]}</td>
            <td>eth${num}</td>
            <td>${route[3]}</td>
            <td>
                <button onclick="deleteRoute(this)" dest="${route[0]}" nexthop="${route[1]}" exitinf="${num}" ad="${route[3]}">
                    <img src="assets/icons/delete.svg"/>
                </button>
            </td>
        </tr>`
    });
    let options = "";
    for (let i = 0; i < focusedDevice.l3infs.length; i++) {
        options += `<option value="${i}">eth${i}</option>`
    }
    return `
    <h2>Routes</h2>
    <div class="config-option">
        <table class="config-table">
            <tr>
                <th style="width:32%;">Destination</th>
                <th style="width:32%;">Next-Hop</th>
                <th style="width:18%">Exit Inf</th>
                <th style="width:10%">AD</th>
                <th style="width:8%"></th>
            </tr>
            ${table_rows}
        </table>
    </div>
    <div class="config-option">
        <input id="add-route-dropdown" class="option-dropdown" type="checkbox">
        <label for="add-route-dropdown" class="option-dropdown-label">Add a Route</label>
        <div class="option-dropdown-contents">
            <form id="add-route-form" class="option-form" onsubmit="addRoute()">
                <label for="dest-ipv4-address">Destination IPv4 Address</label>
                <input name="dest-ipv4-address" class="mono" type="text" placeholder="A.B.C.D" required pattern="(([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5]))"/>
                <label for="dest-ipv4-prefix">Destination IPv4 Prefix</label>
                <input name="dest-ipv4-prefix" class="mono" type="number" min="0" max="30" required/>
                <label for="next-hop-ipv4-address">Next-Hop IPv4 Address</label>
                <input name="next-hop-ipv4-address" class="mono" type="text" placeholder="A.B.C.D" required pattern="(([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5]))"/>
                <label for="exit-interface">Exit Interface</label>
                <select name="exit-interface" required>
                    ${options}
                </select>
                <label for="administrative-distance">Administrative Distance</label>
                <input name="administrative-distance" class="mono" type="number" min="1" value="1" required/>
                <button type="submit">Add</button>
            </form>
        </div>
    </div>
    `
}

const pingTool = (device: Device) => {
    const ping_terminal_lines = '<div>' + device.ping_terminal_lines.join('</div><div>') + '</div>';
    return `
    <div class="config-option">
        <input id="ping-dropdown" class="option-dropdown" type="checkbox">
        <label for="ping-dropdown" class="option-dropdown-label">Ping</label>
        <div class="option-dropdown-contents">
            <form id="execute-ping-form" class="option-form" onsubmit="executePing(this)">
                <label for="dest-ipv4-address">Destination IPv4 Address</label>
                <input name="dest-ipv4-address" class="mono" type="text" placeholder="A.B.C.D" required pattern="(([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5]))"/>
                <label for="ttl">TTL</label>
                <input name="ttl" type="number" min="1", max="255", value="64"/>
                <label for="count">Count</label>
                <input name="count" type="number" min="1", max="255", value="4"/>
                <button type="submit">Send</button>
            </form>
            <div id="ping-terminal-${device.getId().value}" class="config-terminal dark-bg gap-above mono">
                ${ping_terminal_lines}
            </div>
        </div>
    </div>
    `

}

const frameListing = (display_frame_set: DisplayFrame[], idx: number, frame_coords: [number, number][], frame_angle: number[], protocol: Protocol, explanation: string) => {
    let onchangeParam = [];
    for (let i=0; i<frame_coords.length; i++) {
        onchangeParam.push(`[${frame_coords[i][0]}, ${frame_coords[i][1]}, ${frame_angle[i]}]`);
    }
    return `
    <div class="config-option frame-listing ${Protocol[protocol].toLowerCase()}-frame">
        <input id="frame${idx}-dropdown" onchange="drawFrame(${onchangeParam.join(',')})" class="option-dropdown" name="frame-selector" type="radio">
        <label for="frame${idx}-dropdown" class="option-dropdown-label frame-label">
            <div class="ethertype ${Protocol[protocol].toLowerCase()}-label">${Protocol[protocol]}</div>
            <div class="info-1">${display_frame_set[0].frame.src_mac} to ${display_frame_set[0].frame.dest_mac}</div>
        </label>
        <div class="option-dropdown-contents">
            <div>${explanation}</div>
        </div>
    </div>
    `
}

function clearConfigurePanel() {
    configurePanel.innerHTML = '';
}
export function resetConfigurePanel() {
    configurePanel.innerHTML = '<div class="default-notice">Select a device</div>';
}

export function displayInfo(device: Device) {
    // configurePanel.setAttribute("current", device.getId().value.toString());
    clearConfigurePanel();
    configurePanel.innerHTML += `<h2>Interfaces</h2>`
    for (let [idx, l2inf] of device.l2infs.entries()) {
        configurePanel.innerHTML += interfaceConfig(idx, l2inf.mac, InfLayer.L2, l2inf.isActive());
    }
    for (let [idx, l3inf] of device.l3infs.entries()) {
        configurePanel.innerHTML += interfaceConfig(idx, l3inf.mac, InfLayer.L3, l3inf.isActive(), l3inf.ipv4, l3inf.ipv4_prefix);
    }
    if (device.l3infs.length > 0) {
        // add routing section and ping section
        configurePanel.innerHTML += routeConfig(device.getAllRoutes());
        document.getElementById('add-route-form').addEventListener("submit", x => x.preventDefault());

        configurePanel.innerHTML += `<h2>Tools</h2>`;
        configurePanel.innerHTML += pingTool(device);
        document.getElementById('execute-ping-form').addEventListener("submit", x => x.preventDefault());
    }
}

export function displayFrames() {
    clearConfigurePanel();
    configurePanel.innerHTML += `<h2>Captured Frames</h2>`;
    configurePanel.innerHTML +=
    `
    <div id="frame-selectors">
        <input id="arp-select" type="checkbox" checked/>
        <label for="arp-select">ARP</label>
        <input id="icmp-select" type="checkbox" checked/>
        <label for="icmp-select">ICMP</label>
    </div>
    `;

    const frame_sets = RECORDED_FRAMES;
    if (frame_sets.length > 0) {
        configurePanel.innerHTML += `<h3>0:00</h3>`;
    }

    let first_timestamp: number = frame_sets[0][1];
    let section_top_timestamp = first_timestamp;

    for (let i = 0; i < frame_sets.length; i++) {
        const [frame_set, timestamp] = frame_sets[i];
        if (timestamp - section_top_timestamp >= 999) {
            const seconds = Math.trunc((timestamp - first_timestamp) / 1000);
            configurePanel.innerHTML += `<h3>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</h3>`;
            section_top_timestamp = timestamp;
        }

        let frame_coords_set: [number, number][] = []; // coords at which to place the frame image
        let frame_angle_set: number[] = []; // angle to rotate the frame image, in radians
        for (let frame of frame_set) {
            let frame_coords: [number, number];
            let frame_angle: number;
            if (frame.frame.src_mac.isLoopback() || frame.frame.dest_mac.isLoopback()) {
                frame_coords = frame.sender_coords();
                frame_angle = 0;
            }
            else {
                const src_coords = frame.sender_coords();
                console.log(`${frame.egress_mac}`);
                const dest_inf = InfMatrix.getNeighborInf(frame.egress_mac);
                console.log(`${dest_inf}`);
                if (src_coords === undefined || dest_inf === undefined) {
                    throw "invalid frame";
                }
                frame_coords = [
                    (src_coords[0] + dest_inf.coords[0]) / 2,
                    (src_coords[1] + dest_inf.coords[1]) / 2
                ];
                frame_angle = Math.atan2(dest_inf.coords[1] - src_coords[1], dest_inf.coords[0] - src_coords[0]);
            }
            frame_coords_set.push(frame_coords);
            frame_angle_set.push(frame_angle);
        }
        const info = getExplanation(frame_set[0].frame);

        configurePanel.innerHTML += frameListing(frame_set, i, frame_coords_set, frame_angle_set, info[0], info[1]);
    }
}

function refreshL3InfLabels() {
    const labels = document.getElementsByClassName('interface-label');
    if (labels.length != focusedDevice.l3infs.length) {
        return;
    }
    Array.from(labels).forEach((label,idx) => {
        const current_inf = focusedDevice.l3infs[idx];
        label.innerHTML = `
            <div class="name">eth${idx}</div>
            <div class="info-1">${current_inf.isActive() ? "Active" : "Inactive"}</div>
            <div class="info-2">${current_inf.layer == InfLayer.L2 ? "Bridging" : "Routing"}</div>
            <div class="info-3">${current_inf.layer == InfLayer.L3 ? current_inf.ipv4 : ''}</div>
        `
    });
}

function updateIpv4Address(ele: HTMLInputElement) {
    const num_str = ele.getAttribute('num');
    if (num_str === undefined) {
        return;
    }
    const num = parseInt(num_str);
    if (num < 0 || num >= focusedDevice.l3infs.length) {
        return;
    }
    const ipv4 = Ipv4Address.parseString(ele.value);
    if (ipv4 === undefined) {
        return;
    }
    const ipv4_val = ipv4.value;

    focusedDevice.l3infs[num].ipv4 = [ipv4_val[0], ipv4_val[1], ipv4_val[2], ipv4_val[3]];
    refreshL3InfLabels();
} (<any>window).updateIpv4Address = updateIpv4Address;

function updateIpv4Prefix(ele: HTMLInputElement) {
    const num_str = ele.getAttribute('num');
    if (num_str === undefined) {
        return;
    }
    const num = parseInt(num_str);
    if (num < 0 || num >= focusedDevice.l3infs.length) {
        return;
    }
    const prefix = ele.valueAsNumber;
    if (prefix === undefined || prefix < 0 || prefix > 32) {
        return;
    }

    focusedDevice.l3infs[num].ipv4_prefix = prefix;
    refreshL3InfLabels();
} (<any>window).updateIpv4Prefix = updateIpv4Prefix;

function addRoute() {
    const form_ele = <HTMLFormElement>document.getElementById('add-route-form');
    if (form_ele === undefined) {
        return;
    }
    const form = new FormData(form_ele);

    const form_dest_ipv4_address = form.get('dest-ipv4-address') as string;
    const form_dest_ipv4_prefix = form.get('dest-ipv4-prefix') as string;
    const form_next_hop_ipv4_address = form.get('next-hop-ipv4-address') as string;
    const form_exit_interface = form.get('exit-interface') as string;
    const form_administrative_distance = form.get('administrative-distance') as string;
    if (form_dest_ipv4_address === undefined || form_dest_ipv4_prefix === undefined || form_next_hop_ipv4_address === undefined || form_exit_interface === undefined || form_administrative_distance === undefined) {
        console.error("Invalid Form Inputs");
        return;
    }

    const dest_ipv4_address = Ipv4Address.parseString(form_dest_ipv4_address);
    const dest_ipv4_prefix = parseInt(form_dest_ipv4_prefix);
    const next_hop_ipv4_address = Ipv4Address.parseString(form_next_hop_ipv4_address);
    const exit_interface_num = parseInt(form_exit_interface);
    const administrative_distance = parseInt(form_administrative_distance)

    if (dest_ipv4_address === undefined || next_hop_ipv4_address === undefined || isNaN(dest_ipv4_prefix) || isNaN(exit_interface_num) || isNaN(administrative_distance)) {
        console.error("Invalid Form Inputs");
        return;
    }

    if (dest_ipv4_prefix < 0 || dest_ipv4_prefix > 30) {
        console.error("Invalid Destination IPv4 Prefix");
        return;
    }
    if (exit_interface_num < 0 || exit_interface_num >= focusedDevice.l3infs.length) {
        console.error("Invalid Exit Interface");
        return;
    }
    if (administrative_distance < 1) {
        console.error("Invalid Administrative Distance");
        return;
    }

    const local_inf = focusedDevice.l3infs[exit_interface_num].ipv4;

    focusedDevice.setRoute(dest_ipv4_address, new Ipv4Prefix(dest_ipv4_prefix), next_hop_ipv4_address, local_inf, administrative_distance)
    displayInfo(focusedDevice);
} (<any>window).addRoute = addRoute;

function deleteRoute(ele: HTMLButtonElement) {
    const dest = ele.getAttribute('dest');
    const nexthop = ele.getAttribute('nexthop');
    const exitinf = ele.getAttribute('exitinf');
    const ad = ele.getAttribute('ad');

    if (dest === undefined || nexthop === undefined || exitinf === undefined || ad === undefined) {
        console.error("Could not delete route");
        return;
    }

    const dest_split = dest.split('/');

    if (dest_split.length != 2) {
        console.error("Could not delete route");
        return;
    }

    const dest_ipv4_address = Ipv4Address.parseString(dest_split[0]);
    const dest_ipv4_prefix = parseInt(dest_split[1]);
    const next_hop_ipv4_address = Ipv4Address.parseString(nexthop);
    const exit_interface_num = parseInt(exitinf)
    const administrative_distance = parseInt(ad);

    if (dest_ipv4_address === undefined || isNaN(dest_ipv4_prefix) || next_hop_ipv4_address === undefined || isNaN(exit_interface_num) || isNaN(administrative_distance)) {
        console.error("Could not delete route");
        return;
    }
    if (exit_interface_num < 0 || exit_interface_num >= focusedDevice.l3infs.length) {
        console.error("Could not delete route");
        return;
    }

    const local_inf = focusedDevice.l3infs[exit_interface_num].ipv4;

    focusedDevice.deleteRoute(dest_ipv4_address, new Ipv4Prefix(dest_ipv4_prefix), next_hop_ipv4_address, local_inf, administrative_distance);
    displayInfo(focusedDevice)
} (<any>window).deleteRoute = deleteRoute;

function executePing(ele: HTMLButtonElement) {
    const form_ele = <HTMLFormElement>document.getElementById('execute-ping-form') ;
    if (form_ele === undefined) {
        return;
    }
    const form = new FormData(form_ele);

    const form_dest_ipv4_address = form.get('dest-ipv4-address') as string;
    const form_ttl = form.get('ttl') as string;
    const form_count = form.get('count') as string;
    
    if (form_dest_ipv4_address === undefined || form_ttl === undefined || form_count === undefined) {
        console.error('Could not send ping');
        return;
    }

    const dest_ipv4_address = Ipv4Address.parseString(form_dest_ipv4_address);
    const ttl = parseInt(form_ttl);
    const count = parseInt(form_count);

    if (dest_ipv4_address === undefined || isNaN(ttl) || isNaN(count)) {
        console.error('Could not send ping');
        return;
    }

    const device = focusedDevice;
    device.clearPingTerminal();
    refreshPingTerminal(device);
    focusedDevice.ping(dest_ipv4_address, count, ttl,
        (datagram: IcmpDatagram, packet: Ipv4Packet) => { displayPingResponse(device, datagram, packet); },
        (error: string) => { displayPingError(device, error); },
    );
} (<any>window).executePing = executePing;

function displayPingResponse(device: Device, datagram: IcmpDatagram, packet: Ipv4Packet) {
    let response: string;
    switch (datagram.type) {
        case (IcmpControlMessage.ECHO_REPLY):
            response = "response";
            break;
        case (IcmpControlMessage.TIME_EXCEEDED):
            response = "time exceeded";
            break;
        case (IcmpControlMessage.UNREACHABLE):
            if (datagram.code == IcmpUnreachableCode.HOST) {
                response = "destination host unreachable";
                break;
            }
            else if (datagram.code == IcmpUnreachableCode.NET) {
                response = "destination network unreachable";
                break;
            }
            else {
                response = "";
            }
            break;
        default:
            response = "";
    }

    if (response) {
        device.pushPingLine(`Received ${response} from ${packet.src}`);
    }
    refreshPingTerminal(device);
}

function displayPingError(device: Device, error: string) {
    device.pushPingLine(error);
    refreshPingTerminal(device);
}

function refreshPingTerminal(device: Device) {
    const ping_terminal = document.getElementById(`ping-terminal-${device.getId().value}`);
    if (ping_terminal !== null) {
        ping_terminal.innerHTML = '<div>' + device.ping_terminal_lines.join('</div><div>') + '</div>';
    }
}