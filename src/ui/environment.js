import { Ipv4Address, Ipv4Prefix, MacAddress } from "../addressing.js";
import { Device, DeviceType, PersonalComputer, Router, Switch } from "../device.js";
import { InfMatrix } from "../interface.js";
import { redrawCanvas } from "./canvas-init.js";
import { clearFocus } from "./topology.js";
import { ROUTER_INF_NUM, SWITCH_INF_NUM } from "./variables.js";
const fileUpload = document.getElementById('environment-file-upload');
function exportEnvironment(anchor) {
    const env = JSON.stringify({
        "devices": (Device.getList().map((device) => ({
            "type": device.device_type,
            "coords": device.coords,
            "l3infs": device.l3infs.map((inf) => [inf.mac.toString(), inf.ipv4.toString(), inf.ipv4_prefix.value]),
            "l2infs": device.l2infs.map((inf) => inf.mac.toString()),
            "routes": device.getAllRoutes().map((route) => [route[0], route[1].toString(), route[2].toString(), route[3]])
        }))),
        "interfaces": (InfMatrix.adjacency_list.map((infs) => [infs[0].mac.toString(), infs[1].mac.toString()]))
    });
    const data = `text/json;charset=utf-8,${encodeURIComponent(env)}`;
    anchor.setAttribute('href', `data:${data}`);
    anchor.setAttribute('download', 'environment.json');
}
window.exportEnvironment = exportEnvironment;
function loadEnvironment() {
    fileUpload.click();
}
window.loadEnvironment = loadEnvironment;
async function loadJSON(input) {
    const json_str = await input.files[0].text();
    try {
        let object = JSON.parse(json_str);
        const devices = object['devices'];
        const interfaces = object['interfaces'];
        const mac_map = new Map();
        Device.clearTopology();
        for (let device of devices) {
            const coords = device['coords'];
            const l3infs = device['l3infs'];
            const l2infs = device['l2infs'];
            const routes = device['routes'];
            let new_device;
            switch (device['type']) {
                case (DeviceType.PC):
                case (DeviceType.SERVER):
                    new_device = new PersonalComputer();
                    break;
                case (DeviceType.ROUTER):
                    new_device = new Router(ROUTER_INF_NUM);
                    break;
                case (DeviceType.SWITCH):
                    new_device = new Switch(SWITCH_INF_NUM);
                    break;
            }
            if (l3infs.length != new_device.l3infs.length || l2infs.length != new_device.l2infs.length) {
                throw "invalid format";
            }
            for (let i = 0; i < l3infs.length; i++) {
                mac_map.set(l3infs[i][0], new_device.l3infs[i].mac.toString());
                new_device.l3infs[i].ipv4 = Ipv4Address.parseString(l3infs[i][1]).toTuple();
                new_device.l3infs[i].ipv4_prefix = l3infs[i][2];
            }
            for (let i = 0; i < l2infs.length; i++) {
                mac_map.set(l2infs[i], new_device.l2infs[i].mac.toString());
            }
            if (routes.length > 0 && !new_device.hasL3Infs()) {
                throw "invalid format";
            }
            for (let route of routes) {
                const split_dest = route[0].split('/');
                new_device.setRoute(Ipv4Address.parseString(split_dest[0]), new Ipv4Prefix(parseInt(split_dest[1])), Ipv4Address.parseString(route[1]), Ipv4Address.parseString(route[2]), route[3]);
            }
            new_device.coords = [coords[0], coords[1]];
        }
        for (let pair of interfaces) {
            if (!mac_map.has(pair[0]) || !mac_map.has(pair[1])) {
                throw "invalid format";
            }
            const firstMac = MacAddress.parseString(mac_map.get(pair[0]));
            const secondMac = MacAddress.parseString(mac_map.get(pair[1]));
            if (firstMac === undefined || secondMac === undefined) {
                throw "invalid format";
            }
            InfMatrix.connect(firstMac, secondMac);
        }
        clearFocus();
        redrawCanvas();
    }
    catch (e) {
        console.error(e);
    }
}
window.loadJSON = loadJSON;
//# sourceMappingURL=environment.js.map