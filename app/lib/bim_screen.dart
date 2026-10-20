import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'fake_statuses.dart';

const _models = {
  'Duplex.xkt': 'Duplex (малый, 2 этажа)',
  'schependomlaan.xkt': 'Schependomlaan (жилой дом, 16 МБ)',
};

const statusColors = {
  ElementStatus.done: Color(0xFF22B054),
  ElementStatus.inProgress: Color(0xFF2975F5),
  ElementStatus.notStarted: Color(0xFF9EA8B8),
  ElementStatus.remark: Color(0xFFE53935),
};

/// Native Flutter chrome (floors, legend, element card) around a WebView
/// that only draws the xeokit model.
class BimScreen extends StatefulWidget {
  const BimScreen({super.key, required this.baseUri});

  final Uri baseUri;

  @override
  State<BimScreen> createState() => _BimScreenState();
}

class _BimScreenState extends State<BimScreen> {
  late final WebViewController _web;
  // Test hooks: --dart-define=MODEL=schependomlaan.xkt --dart-define=FLOOR=2
  String _model = const String.fromEnvironment('MODEL', defaultValue: 'Duplex.xkt');
  bool _loading = true;
  String? _error;
  String? _stats;
  List<Storey> _storeys = [];
  String? _floorId; // null = all floors
  Map<String, ElementStatus> _statuses = {};

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF4F6F9))
      ..addJavaScriptChannel('Bridge', onMessageReceived: (m) => _onMessage(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? true) setState(() => _error = e.description);
        },
      ))
      ..loadRequest(widget.baseUri.resolve('viewer/index.html'));
  }

  Future<void> _call(String method, [List<Object?> args = const []]) =>
      _web.runJavaScript('window.bim.$method(${args.map(jsonEncode).join(',')})');

  void _loadModel(String file) {
    setState(() {
      _model = file;
      _loading = true;
      _error = null;
      _stats = null;
      _storeys = [];
      _floorId = null;
    });
    // Edges cost GPU time; keep them for the small model only.
    _call('loadModel', [
      widget.baseUri.resolve('models/$file').toString(),
      {'edges': file == 'Duplex.xkt'},
    ]);
  }

  void _onMessage(String raw) {
    final msg = jsonDecode(raw) as Map<String, dynamic>;
    switch (msg['type']) {
      case 'ready':
        _loadModel(_model);
      case 'loaded':
        final storeys = (msg['storeys'] as List)
            .map((s) => Storey.fromJson(s as Map<String, dynamic>))
            .toList();
        _statuses = fakeStatuses(storeys);
        _call('setStatuses', [_statuses.map((id, s) => MapEntry(id, s.wire))]);
        setState(() {
          _loading = false;
          _storeys = storeys;
          _stats = '${msg['objects']} объектов · ${msg['ms']} мс · dpr ${msg['dpr']} · ${msg['canvas']}';
        });
        const floor = int.fromEnvironment('FLOOR');
        if (floor > 0 && floor <= storeys.length) _selectFloor(storeys[floor - 1].id);
      case 'pick':
        if (msg['id'] != null) _showElement(msg);
      case 'error':
        setState(() {
          _loading = false;
          _error = msg['message'] as String?;
        });
    }
  }

  void _selectFloor(String? id) {
    setState(() => _floorId = id);
    id == null ? _call('showAll') : _call('isolateFloor', [id]);
  }

  void _showElement(Map<String, dynamic> e) {
    final status = _statuses[e['id']] ?? ElementStatus.notStarted;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => _ElementCard(element: e, status: status),
    ).whenComplete(() => _call('select', [null]));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('BIM модель'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.apartment_outlined),
            onSelected: _loadModel,
            itemBuilder: (_) => [
              for (final e in _models.entries)
                CheckedPopupMenuItem(value: e.key, checked: e.key == _model, child: Text(e.value)),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Row(
                children: [
                  _FloorRail(storeys: _storeys, selectedId: _floorId, onSelect: _selectFloor),
                  Expanded(
                    child: Stack(
                      children: [
                        Positioned.fill(child: WebViewWidget(controller: _web)),
                        if (_loading) const Center(child: CircularProgressIndicator()),
                        if (_error != null) _ErrorBanner(message: _error!, onRetry: () => _loadModel(_model)),
                        if (_stats != null) Positioned(left: 8, top: 8, child: _Chip(_floorLabel ?? _stats!)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const _Legend(),
          ],
        ),
      ),
    );
  }

  String? get _floorLabel {
    if (_floorId == null) return null;
    return _storeys.firstWhere((s) => s.id == _floorId).name;
  }
}

class _FloorRail extends StatelessWidget {
  const _FloorRail({required this.storeys, required this.selectedId, required this.onSelect});

  final List<Storey> storeys;
  final String? selectedId;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    final top = storeys.reversed.toList();
    return Container(
      width: 60,
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          _FloorButton(label: 'Все', selected: selectedId == null, onTap: () => onSelect(null)),
          for (var i = 0; i < top.length; i++)
            _FloorButton(
              label: '${top.length - i}',
              tooltip: top[i].name,
              selected: selectedId == top[i].id,
              onTap: () => onSelect(top[i].id),
            ),
        ],
      ),
    );
  }
}

class _FloorButton extends StatelessWidget {
  const _FloorButton({required this.label, required this.selected, required this.onTap, this.tooltip});

  final String label;
  final String? tooltip;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final button = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      child: Material(
        color: selected ? scheme.primary : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: SizedBox(
            height: 36,
            child: Center(
              child: Text(label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: selected ? scheme.onPrimary : scheme.onSurface,
                  )),
            ),
          ),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip, child: button);
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Wrap(
        spacing: 16,
        runSpacing: 6,
        alignment: WrapAlignment.center,
        children: [
          for (final s in ElementStatus.values)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(color: statusColors[s], borderRadius: BorderRadius.circular(3)),
              ),
              const SizedBox(width: 6),
              Text(s.label, style: Theme.of(context).textTheme.bodySmall),
            ]),
        ],
      ),
    );
  }
}

class _ElementCard extends StatelessWidget {
  const _ElementCard({required this.element, required this.status});

  final Map<String, dynamic> element;
  final ElementStatus status;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget row(String label, String? value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 110, child: Text(label, style: text.bodyMedium?.copyWith(color: Colors.black54))),
            Expanded(child: Text(value ?? '—', style: text.bodyMedium)),
          ]),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(element['name'] as String? ?? '', style: text.titleMedium),
          const SizedBox(height: 8),
          Row(children: [
            Icon(Icons.circle, size: 12, color: statusColors[status]),
            const SizedBox(width: 6),
            Text(status.label, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 8),
          row('Этаж', element['storeyName'] as String?),
          row('Тип IFC', element['ifcType'] as String?),
          row('GlobalId', element['id'] as String?),
          row('Обновлено', 'тестовые данные'),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(text, style: Theme.of(context).textTheme.labelMedium),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Не удалось показать модель', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Повторить')),
        ]),
      ),
    );
  }
}
