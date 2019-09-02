
import fs from "fs";
import http from "http";
import request from "request-promise-native";
import { binaryToSseData } from "./sse-codec.mjs";
import { encode } from "./base128.mjs";

class SseServer {

    static PORT = 8000;
    nextEventId = 1;
    sseClients = new Set();
    imageSenderTimer;

    constructor () {
        this.httpServer = http.createServer(this.handleRequest.bind(this));
        this.httpServer.listen(SseServer.PORT, this.listenCallback.bind(this));
        this.resetImageSender(0);
    }

    resetImageSender(timeout = 1000) {
        this.imageSenderTimer = setTimeout(this.sendRandomImage.bind(this), timeout);
    }

    listenCallback(error) {
        if (error) {
            console.error(error);
        } else {
            console.info(`Server running at http://localhost:${SseServer.PORT}`);
        }
    }

    handleRequest(request, response) {
        if (request.url === "/images") {
            this.handleNewSseClient(request, response);
        } else if (request.url === "/sse-codec") {
            this.sendJavascriptModule("sse-codec.mjs", request, response);
        } else if (request.url === "/base128") {
            this.sendJavascriptModule("base128.mjs", request, response);
        } else if (request.url === "/debug") {
            this.sendJavascriptModule("debug.mjs", request, response);
        } else if (request.url === "/") {
            this.sendHtml("index.html", request, response);
        } else {
            response.writeHead(404);
            response.end();
            console.info(`Client request "${request.url}" ended with 404`);
        }
    }

    sendHtml(fileName, request, response) {
        return this.sendFile(fileName, "text/html", request, response);
    }

    sendJavascriptModule(fileName, request, response) {
        return this.sendFile(fileName, "text/javascript", request, response);
    }

    sendFile(fileName, contentType, request, response) {
        response.writeHead(200, { "Content-Type": contentType });
        response.write(fs.readFileSync(fileName, "utf-8"));  // tempting to cache, but we need it fresh
        response.end();
    }

    handleNewSseClient(request, response) {
        console.info("Got new SSE client");

        response.writeHead(200, {
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
        });

        request.on("close", () => {
            response.end();
            this.sseClients.delete(response);
        });

        this.sseClients.add(response);
        // noinspection JSIgnoredPromiseFromCall
        this.sendRandomImage(response);
    }

    async fetchRandomImage() {
        return await request({ url: "https://picsum.photos/200", encoding: null });
    }

    prepareBase128Data(buffer, eventId) {
        const base128 = encode(buffer);
        const escapedBuffer = binaryToSseData(base128);
        const escapedString = Buffer.from(escapedBuffer).toString("utf8");

        return SseServer.makeEventMessage(eventId, "base128", escapedString);
    }

    prepareBase64Data(buffer, eventId) {
        const base64String = Buffer.from(buffer).toString("base64");

        return SseServer.makeEventMessage(eventId, "base64", base64String);
    }

    async sendRandomImage(customResponse) {
        try {
            const buffer = await this.fetchRandomImage();

            const eventId = this.nextEventId++;

            const base64 = this.prepareBase64Data(buffer, eventId);
            const base128 = this.prepareBase128Data(buffer, eventId);

            const meta = SseServer.makeEventMessage(eventId, "meta",
                `${buffer.byteLength}|${base64.length}|${base128.length}`);

            const events = meta + base64 + base128;

            if (customResponse) {
                customResponse.write(events);
            } else {
                for (const response of this.sseClients.values()) {
                    response.write(events);
                }
            }
        } catch (error) {
            console.error(error);
            console.error("Failed fetching and sending random image (https://picsum.photos is probably not accessible).");
        }

        if (!customResponse) {  // if not custom, reprogram
            this.resetImageSender(1000);
        }
    }

    static makeEventMessage(eventId, eventName, data) {
        return `id: ${eventId}\nevent: ${eventName}\ndata: ${data}\n\n`;
    }

    static start() {
        return new SseServer();
    }
}

SseServer.start();
