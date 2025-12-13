CLI=piston

.PHONY: help
help:
	./$(CLI) help

.PHONY: start
start:
	./$(CLI) start

.PHONY: restart
restart:
	./$(CLI) restart

.PHONY: stop
stop:
	./$(CLI) stop

.PHONY: update
update:
	./$(CLI) update

.PHONY: build-pkg
build-pkg:
	./$(CLI) build-pkg $(LANG) $(VER)

.PHONY: list-pkgs
list-pkgs:
	./$(CLI) list-pkgs

.PHONY: clean-pkgs
clean-pkgs:
	./$(CLI) clean-pkgs

.PHONY: clean-repo
clean-repo:
	./$(CLI) clean-repo
