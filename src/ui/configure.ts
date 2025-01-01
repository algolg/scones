import { Ipv4Address, Ipv4Prefix, MacAddress } from "../addressing.js";
import { Device } from "../device.js";
import { InfLayer } from "../interface.js";

export const configurePanel = document.getElementById('configure-panel');

const dropdown = (id_num: number, mac: MacAddress, layer: InfLayer, is_active: boolean, ipv4_address?: Ipv4Address, ipv4_prefix?: Ipv4Prefix) => 
`
<div class="config-option">
    <input id="eth${id_num}-dropdown" class="option-dropdown" type="checkbox">
    <label for="eth${id_num}-dropdown" class="option-dropdown-label">
        <div class="name">eth${id_num}</div>
        <div class="info-1">${is_active ? "Active" : "Not active"}</div>
        <div class="info-2">${layer == InfLayer.L2 ? "Bridging" : "Routing"}</div>
    </label>
    <div class="option-dropdown-contents">
        <div>Mac Address: ${mac}</div>
        ${ layer == InfLayer.L3 ?
        `<div>
            <form class="option-form">
                <label for="ipv4-address">IPv4 Address</label>
                <input name="ipv4-address" class="mono" type="text" value="${ipv4_address ?? ''}"/>
                <label for="ipv4-prefix">IPv4 Prefix</label>
                <input name="ipv4-prefix" class="mono" type="number" min="0" max="30" value="${ipv4_prefix}"/>
            </form>
        </div>`
        :
        ``
        }
    </div>
</div>
`

export function resetConfigurePanel() {
    configurePanel.innerHTML = '';
}

export function displayInfo(device: Device) {
    // configurePanel.setAttribute("current", device.getId().value.toString());
    resetConfigurePanel();
    for (let [idx, l2inf] of device.l2infs.entries()) {
        configurePanel.innerHTML += dropdown(idx, l2inf.mac, InfLayer.L2, l2inf.isActive());
    }
    for (let [idx, l3inf] of device.l3infs.entries()) {
        configurePanel.innerHTML += dropdown(idx, l3inf.mac, InfLayer.L3, l3inf.isActive(), l3inf.ipv4, l3inf.ipv4_prefix);
    }
}