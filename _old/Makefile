LISP ?= sbcl

all: test

run:
	rlwrap $(LISP) --load run.lisp

build:
	$(LISP)	--non-interactive \
		--load lagrange.asd \
		--eval '(ql:quickload :lagrange)' \
		--eval '(asdf:make :lagrange)'

test:
	$(LISP) --non-interactive \
		--load run-tests.lisp
