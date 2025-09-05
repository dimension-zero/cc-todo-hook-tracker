#!/usr/bin/env node
import { createServer } from 'vite';

const server = await createServer();
await server.listen();
server.printUrls();