/// Element statuses as a backend would send them (GlobalId -> status).
/// Faked here: lower floors done, middle floors in progress, upper floors not
/// started, and a few remarks, so the colouring looks like a real site.
enum ElementStatus {
  done('done', 'Выполнено'),
  inProgress('in_progress', 'В процессе'),
  notStarted('not_started', 'Не начато'),
  remark('remark', 'Замечание');

  const ElementStatus(this.wire, this.label);
  final String wire;
  final String label;

  static ElementStatus fromWire(String? value) =>
      values.firstWhere((s) => s.wire == value, orElse: () => notStarted);
}

class Storey {
  Storey({required this.id, required this.name, required this.objectIds});

  factory Storey.fromJson(Map<String, dynamic> json) => Storey(
        id: json['id'] as String,
        name: (json['name'] as String?)?.trim().isNotEmpty == true
            ? json['name'] as String
            : json['id'] as String,
        objectIds: (json['objectIds'] as List).cast<String>(),
      );

  final String id;
  final String name;
  final List<String> objectIds;
}

/// [storeys] are ordered bottom to top.
Map<String, ElementStatus> fakeStatuses(List<Storey> storeys) {
  final result = <String, ElementStatus>{};
  final count = storeys.length;
  for (var i = 0; i < count; i++) {
    final progress = count == 1 ? 0.5 : i / (count - 1); // 0 = ground, 1 = roof
    for (final id in storeys[i].objectIds) {
      final roll = id.hashCode.abs() % 100;
      if (roll < 3) {
        result[id] = ElementStatus.remark;
      } else if (progress < 0.34) {
        result[id] = ElementStatus.done;
      } else if (progress < 0.67) {
        result[id] = roll < 55 ? ElementStatus.done : ElementStatus.inProgress;
      } else {
        result[id] = roll < 15 ? ElementStatus.inProgress : ElementStatus.notStarted;
      }
    }
  }
  return result;
}
