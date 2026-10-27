/// Element statuses as the backend (server/) sends them: GlobalId -> status.
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
