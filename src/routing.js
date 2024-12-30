import { Ipv4Prefix } from "./addressing.js";
export class RoutingTable {
    constructor() {
        this._local_infs = []; // or do this through the network controller
        this._table = new Map();
    }
    // network address --> AD --> [remote_gateway, local_inf]
    setLocalInfs(loopback, ...l3infs) {
        this._loopback = loopback;
        l3infs.forEach((l3inf) => this._local_infs.push([l3inf.ipv4, l3inf.ipv4_prefix]));
    }
    /**
     * Adds a route to the routing table. Note that remote_gateway and local_inf must refer to the same path.
     * @param dest_ipv4 The destination network of the route
     * @param dest_prefix The destination CIDR prefix of the route
     * @param remote_gateway The next-hop gateway for the route (must be reachable through local_inf)
     * @param local_inf The interface out of which packets exit (must provide point towards remote_gateway)
     * @param administrative_distance The administrative distance (preference) of the route. A lower value indicates higher preference.
     * @returns
     */
    set(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) {
        const key = dest_ipv4.and(dest_prefix).toString();
        const new_route = [remote_gateway, local_inf];
        administrative_distance = Math.max(1, administrative_distance); // only directly connected routes will have AD of 0
        // if the destination already has route(s), add the route only if it is new
        if (this._table.has(key)) {
            const routes = this._table.get(key).get(administrative_distance);
            for (let route of routes) {
                if (route[0] == new_route[0] && route[1] == new_route[1]) {
                    return false;
                }
            }
            routes.push(new_route);
        }
        // otherwise, add the route
        else {
            this._table.set(key, new Map()
                .set(administrative_distance, [[remote_gateway, local_inf]]));
        }
        return true;
    }
    /**
     * Gets an array of the lowest-cost routes to a destination IPv4 address
     * @param dest_ipv4 the destination IPv4 address of the route
     * @returns an array of (remote gateway, local interface) IPv4 address pairs
     */
    get(dest_ipv4) {
        // if the device itself has the destination interface, return [[dest_ipv4, loopback(?)]]
        // if the device is on the subnet of the dest ipv4, return [dest_ipv4, local inf][]
        for (let pairs of this._local_infs) {
            if (pairs === undefined) {
                continue;
            }
            if (dest_ipv4.compare(pairs[0]) == 0) {
                return [[dest_ipv4, this._loopback]];
            }
            if (dest_ipv4.and(pairs[1]).compare(pairs[0].and(pairs[1])) == 0) {
                return [[dest_ipv4, pairs[0]]];
            }
        }
        for (let i = 32; i >= 0; i--) {
            const try_search = this._table.get(dest_ipv4.and(new Ipv4Prefix(i)).toString());
            if (try_search !== undefined) {
                const routes = try_search.get(Math.min(...try_search.keys()));
                // put the top route at the bottom of the array (for load balancing)
                routes.push(routes.splice(0, 1)[0]);
                return routes;
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=routing.js.map