import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Serves the bundled `assets/` folder on 127.0.0.1 so the WebView loads the
/// viewer and the .xkt models over http. Android WebView blocks fetch() from
/// file:// pages, which rules out loading the assets directly.
class AssetServer {
  HttpServer? _server;

  Uri get baseUri => Uri.parse('http://127.0.0.1:${_server!.port}/');

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen(_handle);
  }

  Future<void> stop() async => _server?.close(force: true);

  Future<void> _handle(HttpRequest request) async {
    final path = Uri.decodeComponent(request.uri.path).replaceFirst('/', '');
    final response = request.response;
    try {
      final data = await rootBundle.load('assets/$path');
      response.headers
        ..contentType = _contentType(path)
        ..set('Cache-Control', 'no-cache');
      response.add(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
    } on FlutterError {
      response.statusCode = HttpStatus.notFound;
    }
    await response.close();
  }

  static ContentType _contentType(String path) {
    if (path.endsWith('.html')) return ContentType.html;
    if (path.endsWith('.js')) return ContentType('text', 'javascript', charset: 'utf-8');
    return ContentType.binary;
  }
}
