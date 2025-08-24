import { Ipv4Prefix } from "./addressing.js";
export class RoutingTable {
    // network address --> AD --> [remote_gateway, local_inf]
    constructor(loopback, ...l3infs) {
        this._local_infs = [];
        this._table = new Map();
        this._loopback = loopback;
        this._local_infs.push([loopback, new Ipv4Prefix(32)]);
        l3infs.forEach((l3inf) => this._local_infs.push([l3inf.ipv4, l3inf.ipv4_prefix]));
    }
    /**
     * Adds a route to the routing table. Note that remote_gateway and local_inf must refer to the same path.
     * @param dest_ipv4 The destination network of the route
     * @param dest_prefix The destination CIDR prefix of the route
     * @param remote_gateway The next-hop gateway for the route (must be reachable through local_inf)
     * @param local_inf The interface out of which packets exit (must point towards remote_gateway)
     * @param administrative_distance The administrative distance (preference) of the route. A lower value indicates higher preference.
     * @returns
     */
    set(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) {
        const key = `${dest_ipv4.and(dest_prefix)}/${dest_prefix.value}`;
        const new_route = [remote_gateway, local_inf];
        administrative_distance = Math.max(1, administrative_distance); // only directly connected routes will have AD of 0
        // if the destination already has route(s), add the route only if it is new
        let dest_routes;
        if (this._table.has(key) && (dest_routes = this._table.get(key))) {
            const routes = dest_routes.get(administrative_distance) ?? [];
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
    get(dest_ipv4, remote_only = false) {
        // if the device itself has the destination interface, return [[dest_ipv4, loopback]]
        // if the device is on the subnet of the dest ipv4, return [dest_ipv4, local inf][]
        if (!remote_only) {
            for (let pairs of this._local_infs) {
                if (!pairs) {
                    continue;
                }
                if (dest_ipv4.compare(pairs[0]) == 0) {
                    return [[dest_ipv4, this._loopback]];
                }
                if (dest_ipv4.and(pairs[1]).compare(pairs[0].and(pairs[1])) == 0) {
                    return [[dest_ipv4, pairs[0]]];
                }
            }
        }
        for (let i = 32; i >= 0; i--) {
            const try_search = this._table.get(`${dest_ipv4.and(new Ipv4Prefix(i))}/${i}`);
            if (try_search) {
                const routes = try_search.get(Math.min(...try_search.keys()));
                if (routes) {
                    // put the top route at the bottom of the array (for load balancing)
                    routes.push(routes.splice(0, 1)[0]);
                    return routes;
                }
            }
        }
        return null;
    }
    delete(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) {
        const key = `${dest_ipv4.and(dest_prefix)}/${dest_prefix.value}`;
        const find_route = [remote_gateway, local_inf];
        let ADs;
        if (this._table.has(key) && (ADs = this._table.get(key))) {
            if (ADs.has(administrative_distance)) {
                let routes = ADs.get(administrative_distance);
                const route_idx = routes?.findIndex((val) => val[0].compare(find_route[0]) == 0 &&
                    val[1].compare(find_route[1]) == 0) ?? -1;
                if (routes && route_idx != -1) {
                    // Delete the route
                    routes.splice(route_idx, 1);
                    // Delete unneeded route info
                    if (routes.length == 0) {
                        ADs.delete(administrative_distance);
                        if (ADs.size == 0) {
                            this._table.delete(key);
                        }
                    }
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Gets all non-local routes on the device
     * @returns An array of [Destination Network, Next-Hop IPv4, Exit Interface IPv4, Administrative Distance] tuples defining every route
     */
    getAllRoutes() {
        let output = [];
        for (let dest of this._table.entries()) {
            for (let AD of dest[1]) {
                for (let route_info of AD[1]) {
                    output.push([dest[0], route_info[0], route_info[1], AD[0]]);
                }
            }
        }
        return output;
    }
}
//# sourceMappingURL=routing.js.map