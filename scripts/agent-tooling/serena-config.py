"""Render complete configuration from the pinned Serena producer, without writes."""
import dataclasses
import json
import sys

from serena.config.serena_config import ProjectConfig, SerenaConfig
from solidlsp.ls_config import LanguageServerId

root = sys.argv[1]
tools = json.loads(sys.argv[2])
project = ProjectConfig(
    project_name="lagrange-quest-tools",
    language_servers=[LanguageServerId.TYPESCRIPT],
    read_only=True,
    default_modes=["planning"],
    fixed_tools=tools,
    ignored_paths=["test-output/**", "vendor/**", "solve/quests/**/evidence/**"],
)
config = SerenaConfig(
    projects=[],
    base_modes=[],
    default_modes=["planning"],
    fixed_tools=tools,
    web_dashboard=False,
    web_dashboard_open_on_launch=False,
    gui_log_window=False,
    default_max_tool_answer_chars=20000,
    trusted_project_path_patterns=[root],
)
global_fields = {
    field.name: getattr(config, field.name)
    for field in dataclasses.fields(config)
    if not field.name.startswith("_")
}
global_fields.update(
    projects=[root],
    language_backend=config.language_backend.get_key(),
    agent_interface=config.agent_interface.value,
    line_ending=config.line_ending.value,
)
print(json.dumps({
    ".serena/project.yml": json.dumps(project._to_yaml_dict(), indent=2) + "\n",
    ".codex/quest-tooling/serena-home/serena_config.yml":
        json.dumps(global_fields, indent=2) + "\n",
}))
