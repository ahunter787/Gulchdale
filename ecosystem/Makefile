# This project's development ecosystem: Plane (ticketing), Outline
# (documentation) and Mailpit (mail sink).
#
# Run these from here, or from the project root with
# `make -C ecosystem <target>`.
#
#   make env        once: pick this machine's address and a free port block
#   make install    bring all three services up
#   make bootstrap  create the workspace, project, API tokens and mail wiring
#   make health     what is up, where, and is anything else holding its ports
#   make down       stop everything, keep every byte of data
#
# Three Docker Compose projects, one per service group, named after this
# project's slug. They are independent of the application's own compose project,
# so `make down` here can never touch it.

COMPOSE ?= docker compose
INFRA_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
RUNTIME_DIR := $(INFRA_DIR)/.runtime
ENV_FILE := $(RUNTIME_DIR)/env
PLANE_DIR := $(RUNTIME_DIR)/plane-app
BASE_ENV := --env-file $(ENV_FILE)
MAIL_COMPOSE := -f $(INFRA_DIR)/mail/docker-compose.yml
OUTLINE_COMPOSE := -f $(INFRA_DIR)/outline/docker-compose.yml
OUTLINE_ENV := $(RUNTIME_DIR)/outline.env
PLANE_COMPOSE := $(COMPOSE) --env-file variables.env

-include $(ENV_FILE)
S ?= all
ARGS ?=

.DEFAULT_GOAL := help
.PHONY: help env network install bootstrap up down down-hard teardown ps logs health \
        plane-install outline-install plane-up plane-down outline-up outline-down \
        mail-up mail-down docs-sync plane-sync verify backup mailbox restore-test restore-test-verify

help: ## Show these targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

env: ## Choose this machine's address and a free block of ports (.runtime/env)
	@$(INFRA_DIR)/integrations/init-env.sh

network: ## Create the shared Docker network the three service groups join
	@$(INFRA_DIR)/integrations/ensure-network.sh

install: env network ## Install/refresh Mailpit, Outline and Plane (the full first run)
	$(MAKE) -C $(INFRA_DIR) mail-up
	$(INFRA_DIR)/outline/install.sh
	$(INFRA_DIR)/plane/install.sh
	@echo ""
	@echo "Services are up. Next: make bootstrap (workspace, project, tokens, mail)."

bootstrap: ## Create the Plane workspace/project/token and the Outline collection
	@$(INFRA_DIR)/integrations/bootstrap.sh $(ARGS)

verify: ## Assert the plan and the documentation match what is published
	@$(INFRA_DIR)/integrations/verify.sh $(ARGS)

up: network mail-up outline-up plane-up ## Start every service (data is kept)
	@echo "Waiting for the services to answer..."
	@for i in $$(seq 1 20); do \
		if $(INFRA_DIR)/integrations/health.sh --brief >/dev/null 2>&1; then \
			$(INFRA_DIR)/integrations/health.sh --brief; exit 0; \
		fi; \
		sleep 3; \
	done; \
	echo "Some services did not answer within 60s - run 'make health' for the detail"; exit 1

down: plane-down outline-down mail-down ## Stop every service (data is kept)
	@echo "Stopped. Data and volumes are untouched."

teardown: ## Stop everything and delete its data (asks first; keeps secrets)
	@$(INFRA_DIR)/integrations/teardown.sh $(ARGS)

down-hard: ## DESTROY this ecosystem's data (volumes and Plane's data directory)
	@echo "This deletes Plane's and Outline's databases, uploads and settings."
	@printf "Type 'yes' to continue: " && read ans && [ "$$ans" = "yes" ] || (echo "aborted"; exit 1)
	-$(COMPOSE) $(BASE_ENV) $(MAIL_COMPOSE) down -v
	-$(COMPOSE) $(BASE_ENV) $(OUTLINE_COMPOSE) down -v
	-@if [ -f $(PLANE_DIR)/variables.env ]; then cd $(PLANE_DIR) && $(PLANE_COMPOSE) down -v; fi
	@echo "Data destroyed. 'make install' starts over."

ps: ## Show this ecosystem's containers
	@echo "--- mail / outline / plane ---"
	@$(COMPOSE) $(BASE_ENV) $(MAIL_COMPOSE) ps
	@$(COMPOSE) $(BASE_ENV) $(OUTLINE_COMPOSE) ps
	@if [ -f $(PLANE_DIR)/variables.env ]; then cd $(PLANE_DIR) && $(PLANE_COMPOSE) ps; fi

logs: ## Follow logs: make logs S=plane|outline|mail
	@case "$(S)" in \
		plane) cd $(PLANE_DIR) && $(PLANE_COMPOSE) logs -f --tail=100 ;; \
		outline) $(COMPOSE) $(BASE_ENV) $(OUTLINE_COMPOSE) logs -f --tail=100 ;; \
		mail) $(COMPOSE) $(BASE_ENV) $(MAIL_COMPOSE) logs -f --tail=100 ;; \
		*) echo "usage: make logs S=plane|outline|mail"; exit 1 ;; \
	esac

health: ## Probe every service and assert its ports belong to this ecosystem
	@$(INFRA_DIR)/integrations/health.sh $(ARGS)

plane-install: network ## Download/refresh Plane's config bundle and start it
	$(INFRA_DIR)/plane/install.sh

outline-install: network ## Create/refresh Outline's env and start it
	$(INFRA_DIR)/outline/install.sh

mail-up: network ## Start the Mailpit sink
	@$(COMPOSE) $(BASE_ENV) $(MAIL_COMPOSE) up -d --quiet-pull

mail-down: ## Stop the Mailpit sink
	@$(COMPOSE) $(BASE_ENV) $(MAIL_COMPOSE) down

plane-up: ## Start Plane
	@if [ -f $(PLANE_DIR)/variables.env ]; then cd $(PLANE_DIR) && $(PLANE_COMPOSE) up -d; \
	else echo "Plane is not installed yet: make plane-install"; exit 1; fi

plane-down: ## Stop Plane
	@if [ -f $(PLANE_DIR)/variables.env ]; then cd $(PLANE_DIR) && $(PLANE_COMPOSE) down; \
	else echo "Plane is not installed"; fi

outline-up: ## Start Outline
	@[ -f "$(OUTLINE_ENV)" ] || { echo "run 'make outline-install' first"; exit 1; }
	@$(COMPOSE) $(BASE_ENV) $(OUTLINE_COMPOSE) up -d

outline-down: ## Stop Outline
	@$(COMPOSE) $(BASE_ENV) $(OUTLINE_COMPOSE) down

docs-sync: ## Publish the project's docs into Outline (ARGS="--apply" to write)
	@$(INFRA_DIR)/integrations/publish-docs.sh $(ARGS)

plane-sync: ## Mirror the roadmap and register into Plane (ARGS="--apply" to write)
	@$(INFRA_DIR)/integrations/sync-roadmap.sh $(ARGS)

backup: ## Dump Plane, Outline and Mailpit into .runtime/backups/
	@$(INFRA_DIR)/integrations/backup.sh

restore-test: ## Restore to an isolated clone (explicit BACKUP=absolute-path required)
	@test -n "$(BACKUP)" || (echo "BACKUP is required"; exit 1)
	@node $(INFRA_DIR)/integrations/restore-test.mjs create "$(BACKUP)"

restore-test-verify: ## Verify a restored clone (explicit RUN=absolute-path required)
	@test -n "$(RUN)" || (echo "RUN is required"; exit 1)
	@node $(INFRA_DIR)/integrations/restore-test.mjs verify "$(RUN)"

mailbox: ## Show the local mail sink, with any sign-in links (ARGS="--search outline")
	@$(INFRA_DIR)/integrations/mailbox.sh $(ARGS)
