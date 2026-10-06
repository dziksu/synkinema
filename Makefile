.DEFAULT_GOAL := help
RUFF ?= .venv/bin/ruff
PYTHON ?= .venv/bin/python

.PHONY: help format format-check format-web format-python check dependency-check lint test-tools api-check test-python test-web build build-local

help:
	@echo "make format        — format frontend/config (Biome) and Python (Ruff)"
	@echo "make format-check  — check formatting without changing files"
	@echo "Override Ruff when needed: make format-check RUFF=ruff"
	@echo "make check         — the complete local/CI verification gate"

format: format-web format-python

format-web:
	npm --prefix apps/studio run format

format-python:
	$(RUFF) format apps/server tests scripts

format-check:
	npm --prefix apps/studio run format:check
	$(RUFF) format --check apps/server tests scripts

check: dependency-check format-check lint test-tools api-check test-python test-web build

dependency-check:
	$(PYTHON) -m pytest -q tests/test_local_helper_packaging.py::test_helper_dependency_versions_match_engine_lock

lint:
	$(RUFF) check apps/server tests scripts

test-tools:
	npm test
	npm run release:check

api-check:
	SYNKINEMA_PYTHON=$(PYTHON) npm --prefix apps/studio run api:check

test-python:
	$(PYTHON) -m pytest -q

test-web:
	npm --prefix apps/studio test

build:
	npm --prefix apps/studio run build

build-local:
	$(PYTHON) scripts/build_local_helper.py
