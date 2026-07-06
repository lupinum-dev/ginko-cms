# Future Decisions

## Ginko Content Tree Support For CMS

Decision for now: do not open a Ginko Content PR for CMS tree handling.

Ginko Content and Ginko CMS share the same tree invariant, but not the same
tree source model. Ginko Content derives navigation from filesystem paths,
numeric filenames, index-file promotion, `.navigation.yml`, synthetic folders,
and canonical projection. Ginko CMS owns parent-id plus sibling-rank placement.
The useful shared behavior is the rule: build a canonical tree first, sort only
within sibling groups, then flatten or project in pre-order.

That rule is small enough, and the input models differ enough, that sharing a
public tree-builder utility would add more coupling than value. It would either
leak filesystem assumptions into CMS or force Ginko Content to expose a generic
adapter surface that is not currently needed.

Potential future Ginko Content PRs that could make sense:

- Strengthen provider contract tests so `navigation()` must return stable
  parent-before-child order.
- Document that provider navigation is a canonical tree projection and consumers
  must not infer hierarchy from global sort order.

Avoid for now:

- Exporting a public generic tree builder from Ginko Content.
- Moving CMS parent/rank policy into Ginko Content.
- Adding CMS compatibility paths around filesystem-only behavior such as numeric
  filename sorting, index promotion, or synthetic pathless folders.

Open parity question:

CMS public `surround` currently uses sibling-only `parentEntryId + orderKey`
semantics. Ginko Content flattens navigation in pre-order for surroundings.
If exact parity becomes a product requirement, decide intentionally whether CMS
surround should remain sibling-local or switch to navigation-flattened previous
and next behavior.
