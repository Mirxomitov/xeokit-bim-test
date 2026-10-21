import 'package:flutter/material.dart';

import 'asset_server.dart';
import 'bim_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final server = AssetServer();
  await server.start();
  runApp(BimTestApp(server: server));
}

class BimTestApp extends StatelessWidget {
  const BimTestApp({super.key, required this.server});

  final AssetServer server;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'HOOPS BIM test',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      home: BimScreen(baseUri: server.baseUri),
    );
  }
}
