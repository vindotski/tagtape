<?php

namespace App\Validator\Constraint;

use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class DurationValidator extends ConstraintValidator
{
  public function validate($value, Constraint $constraint)
  {
    if (!$constraint instanceof Duration) {
      throw new UnexpectedTypeException($constraint, Duration::class);
    }

    if (null === $value) {
      return;
    }

    $content = shell_exec("youtube-dl $value --dump-json");
    $duration = (int) json_decode($content, true)['duration'];

    if (null == $duration || !is_int($duration)) {
      $this->context->buildViolation($constraint->invalidMessage)
        ->setCode(Duration::DURATION_UNKNOWN_ERROR)
        ->addViolation();
      return;
    }

    if ($duration > $constraint->max) {
      $this->context->buildViolation($constraint->maxMessage)
        ->setParameter('{{ limit }}', $constraint->max)
        ->setCode(Duration::DURATION_EXCEEDED_ERROR)
        ->setInvalidValue($duration)
        ->addViolation();
    }
  }
}
