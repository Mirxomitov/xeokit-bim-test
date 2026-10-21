import 'dart:io';

import 'package:flutter/material.dart';

import 'bim_screen.dart';

// aps/server/server.js on the dev machine. Simulators reach it as localhost (Android: 10.0.2.2);
// a phone needs the machine's LAN address: --dart-define=APS_SERVER=http://192.168.1.10:8090
const _server = String.fromEnvironment('APS_SERVER');

void main() {
  final server = _server.isNotEmpty
      ? _server
      : Platform.isAndroid
          ? 'http://10.0.2.2:8090'
          : 'http://127.0.0.1:8090';
  runApp(BimTestApp(serverUri: Uri.parse('$server/')));
}

class BimTestApp extends StatelessWidget {
  const BimTestApp({super.key, required this.serverUri});

  final Uri serverUri;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'APS BIM test',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      home: BimScreen(serverUri: serverUri),
    );
  }
}
