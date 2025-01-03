import { Ipv4Address, Ipv4Prefix } from "../addressing.js";
import { InfLayer } from "../interface.js";
import { focusedDevice } from "./topology.js";
export const configurePanel = document.getElementById('configure-panel');
const interfaceConfig = (id_num, mac, layer, is_active, ipv4_address, ipv4_prefix) => `
<div class="config-option">
    <input id="eth${id_num}-dropdown" class="option-dropdown" type="checkbox">
    <label for="eth${id_num}-dropdown" class="option-dropdown-label">
        <div class="name">eth${id_num}</div>
        <div class="info-1">${is_active ? "Active" : "Not active"}</div>
        <div class="info-2">${layer == InfLayer.L2 ? "Bridging" : "Routing"}</div>
    </label>
    <div class="option-dropdown-contents">
        <div>Mac Address: ${mac}</div>
        ${layer == InfLayer.L3 ?
    `<div>
            <form class="option-form ip-change">
                <label for="ipv4-address">IPv4 Address</label>
                <input name="ipv4-address" onchange="updateIpv4Address(this)" class="mono" type="text" value="${ipv4_address ?? ''}" num="${id_num}"/>
                <label for="ipv4-prefix">IPv4 Prefix</label>
                <input name="ipv4-prefix" onchange="updateIpv4Prefix(this)" class="mono" type="number" min="0" max="30" value="${ipv4_prefix.value ?? undefined}" num="${id_num}"/>
            </form>
        </div>`
    :
        ``}
    </div>
</div>
`;
const routeConfig = (routes) => {
    let table_rows = "";
    routes.forEach((route) => table_rows += `
        <tr>
            <td>${route[0]}</td>
            <td>${route[1]}</td>
            <td>eth${focusedDevice.l3infs.find((inf) => inf.ipv4.compare(route[2]) == 0).num}</td>
            <td>${route[3]}</td>
            <td>
                <button onclick="deleteRule(this)" dest="${route[0]}" nexthop="${route[1]}" exitinf="${route[2]}" ad="${route[3]}">
                    <img src="assets/icons/delete.svg"/>
                </button>
            </td>
        </tr>`);
    let options = "";
    for (let i = 0; i < focusedDevice.l3infs.length; i++) {
        options += `<option value="${i}">eth${i}</option>`;
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
        <input id="add-route-dropdown" class="option-dropdown" type="checkbox">
        <label for="add-route-dropdown" class="option-dropdown-label"><u>Add a Route</u></label>
        <div class="option-dropdown-contents">
            <form id="add-route-form" class="option-form" onsubmit="addRoute()">
                <label for="dest-ipv4-address">Destination IPv4 Address</label>
                <input name="dest-ipv4-address" class="mono" type="text" required pattern="(([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5]))"/>
                <label for="dest-ipv4-prefix">Destination IPv4 Prefix</label>
                <input name="dest-ipv4-prefix" class="mono" type="number" min="0" max="30" required/>
                <label for="next-hop-ipv4-address">Next-Hop IPv4 Address</label>
                <input name="next-hop-ipv4-address" class="mono" type="text" required pattern="(([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5])\.([01]?[0-9][0-9]?|2[0-4][0-9]|25[0-5]))"/>
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
    `;
};
export function resetConfigurePanel() {
    configurePanel.innerHTML = '';
}
export function displayInfo(device) {
    // configurePanel.setAttribute("current", device.getId().value.toString());
    resetConfigurePanel();
    configurePanel.innerHTML += `<h2>Interfaces</h2>`;
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
    }
}
function updateIpv4Address(ele) {
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
}
window.updateIpv4Address = updateIpv4Address;
function updateIpv4Prefix(ele) {
    const num_str = ele.getAttribute('num');
    if (num_str === undefined) {
        return;
    }
    const num = parseInt(num_str);
    if (num < 0 || num >= focusedDevice.l3infs.length) {
        return;
    }
    const prefix = ele.valueAsNumber;
    if (prefix === undefined || prefix < 0 || prefix > 30) {
        return;
    }
    focusedDevice.l3infs[num].ipv4_prefix = prefix;
}
window.updateIpv4Prefix = updateIpv4Prefix;
function addRoute() {
    const form_ele = document.getElementById('add-route-form');
    if (form_ele === undefined) {
        return;
    }
    const form = new FormData(form_ele);
    console.log(form);
    const form_dest_ipv4_address = form.get('dest-ipv4-address');
    const form_dest_ipv4_prefix = form.get('dest-ipv4-prefix');
    const form_next_hop_ipv4_address = form.get('next-hop-ipv4-address');
    const form_exit_interface = form.get('exit-interface');
    const form_administrative_distance = form.get('administrative-distance');
    if (form_dest_ipv4_address === undefined || form_dest_ipv4_prefix === undefined || form_next_hop_ipv4_address === undefined || form_exit_interface === undefined || form_administrative_distance === undefined) {
        console.error("Invalid Form Inputs");
        return;
    }
    const dest_ipv4_address = Ipv4Address.parseString(form_dest_ipv4_address);
    const dest_ipv4_prefix = parseInt(form_dest_ipv4_prefix);
    const next_hop_ipv4_address = Ipv4Address.parseString(form_next_hop_ipv4_address);
    const exit_interface_num = parseInt(form_exit_interface);
    const administrative_distance = parseInt(form_administrative_distance);
    if (dest_ipv4_address === undefined || next_hop_ipv4_address === undefined || isNaN(dest_ipv4_prefix) || isNaN(exit_interface_num) || isNaN(administrative_distance)) {
        console.error("Invalid Form Inputs");
        return;
    }
    console.log(dest_ipv4_prefix);
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
    focusedDevice.setRoute(dest_ipv4_address, new Ipv4Prefix(dest_ipv4_prefix), next_hop_ipv4_address, local_inf, administrative_distance);
    displayInfo(focusedDevice);
}
window.addRoute = addRoute;
//# sourceMappingURL=configure.js.map