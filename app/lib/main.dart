import 'dart:io';

import 'package:flutter/material.dart';

import 'asset_server.dart';
import 'backend.dart';
import 'bim_screen.dart';

// backend/ (NestJS) on the dev machine. Simulators reach it as localhost (Android: 10.0.2.2);
// a phone needs the machine's LAN address: --dart-define=BACKEND=http://192.168.1.10:8091
const _backend = String.fromEnvironment('BACKEND');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final server = AssetServer();
  await server.start();
  final backend = _backend.isNotEmpty
      ? _backend
      : Platform.isAndroid
          ? 'http://10.0.2.2:8091'
          : 'http://127.0.0.1:8091';
  runApp(BimTestApp(server: server, backend: Backend(Uri.parse('$backend/'))));
}

class BimTestApp extends StatelessWidget {
  const BimTestApp({super.key, required this.server, required this.backend});

  final AssetServer server;
  final Backend backend;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BIM test',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      home: BimScreen(baseUri: server.baseUri, backend: backend),
    );
  }
}
